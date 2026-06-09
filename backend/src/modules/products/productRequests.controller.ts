import { Request, Response } from 'express';
import { supabaseAdmin } from '../../config/supabaseClient.js';
import * as productService from '../products/product.service.js';
import { v4 as uuidv4 } from 'uuid';
import { generateOcrKeywords } from './product-ai.utils.js';

// ─── GET /api/product-requests ───────────────────────────────────────────────
// Super Admin: get all requests. Branch Admin: get only their own.
export const listRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const isSuperAdmin = user.role === 'super_admin';

    let query = supabaseAdmin
      .from('product_requests')
      .select(`
        id, branch_id, name, category, price, sku, description, unit, image_url,
        status, rejection_reason, created_at, reviewed_at,
        requested_by, reviewed_by
      `)
      .order('created_at', { ascending: false });

    if (!isSuperAdmin) {
      query = query.eq('branch_id', user.branch_id);
    }

    const { status } = req.query;
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // Fetch branch names separately to avoid join issues
    let branchMap: Record<string, { name: string; code: string }> = {};
    try {
      const { data: branches } = await supabaseAdmin.from('branches').select('id, name, code');
      if (branches) {
        for (const b of branches) {
          branchMap[b.id] = { name: b.name, code: b.code };
        }
      }
    } catch {}

    const result = (data || []).map((r: any) => ({
      ...r,
      branch_name: branchMap[r.branch_id]?.name || null,
      branch_code: branchMap[r.branch_id]?.code || null,
    }));

    res.json({ status: 'success', data: result });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── POST /api/product-requests ─────────────────────────────────────────────
// Branch Admin submits a product request for super admin approval
export const submitRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!user.branch_id) {
      return res.status(403).json({ status: 'error', message: 'Branch ID not found in token' });
    }

    const { name, category, price, sku, description, unit } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!name || !price) {
      return res.status(400).json({ status: 'error', message: 'Nama produk dan harga wajib diisi' });
    }

    // Generate unique ID for request
    const requestId = uuidv4();

    // Upload all angle images to Supabase Storage (4 main angles)
    const ANGLE_FIELDS = [
      { field: 'imageFront', angle: 'front' },
      { field: 'imageBack',  angle: 'back'  },
      { field: 'imageLeft',  angle: 'left'  },
      { field: 'imageRight', angle: 'right' },
    ];

    const imageEntries: { angle: string; filename: string; storagePath: string; imageUrl: string }[] = [];
    let frontPublicUrl: string | null = null;

    for (const { field, angle } of ANGLE_FIELDS) {
      const file = files?.[field]?.[0];
      if (!file) continue;

      const storagePath = `requests/${requestId}/${angle}-${file.originalname}`;

      const uploadResult = await productService.uploadImageToStorage(
        file.buffer,
        storagePath,
        file.mimetype
      );

      if (!uploadResult.ok || !uploadResult.url) {
        console.warn(`[submitRequest] ⚠️ Failed to upload ${angle} image:`, uploadResult.error);
        continue;
      }

      imageEntries.push({
        angle,
        filename: file.originalname,
        storagePath,
        imageUrl: uploadResult.url,
      });

      if (angle === 'front') {
        frontPublicUrl = uploadResult.url;
      }
    }

    // ── Upload product video (for AI training frame extraction) ──
    const videoFile = files?.['video']?.[0];
    if (videoFile) {
      const videoPath = `requests/${requestId}/video-${videoFile.originalname}`;
      const videoUpload = await productService.uploadImageToStorage(videoFile.buffer, videoPath, videoFile.mimetype);
      if (videoUpload.ok && videoUpload.url) {
        imageEntries.push({ angle: 'video', filename: videoFile.originalname, storagePath: videoPath, imageUrl: videoUpload.url });
      }
    }

    // Serialize images metadata into description
    const requestDesc = JSON.stringify({
      reason: description || '',
      images: imageEntries
    });

    const { data, error } = await supabaseAdmin
      .from('product_requests')
      .insert([{
        id: requestId,
        branch_id: user.branch_id,
        requested_by: user.sub,
        name: name.trim(),
        category: category || 'Uncategorized',
        price: Number(price),
        sku: sku || null,
        description: requestDesc,
        unit: unit || 'pcs',
        image_url: frontPublicUrl || null,
        status: 'pending',
      }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ status: 'success', data });
  } catch (err: any) {
    console.error('[submitRequest] error:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── PATCH /api/product-requests/:id/approve ─────────────────────────────────
// Super Admin approves a product request → creates product + branch_inventory entry
export const approveRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    // Only super admin can approve
    if (user.role !== 'super_admin') {
      return res.status(403).json({ status: 'error', message: 'Only super admin can approve product requests' });
    }

    // Get the request
    const { data: reqData, error: reqErr } = await supabaseAdmin
      .from('product_requests')
      .select('*')
      .eq('id', id)
      .eq('status', 'pending')
      .single();

    if (reqErr || !reqData) {
      return res.status(404).json({ status: 'error', message: 'Request not found or already processed' });
    }

    // Allow optional price/category override from super admin body
    const finalPrice = req.body.price ? Number(req.body.price) : reqData.price;
    const finalCategory = req.body.category || reqData.category;
    const finalSku = reqData.sku || `PROD-${reqData.name.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    let reasonText = reqData.description || '';
    let imagesToRegister: any[] = [];

    try {
      if (reqData.description && reqData.description.trim().startsWith('{')) {
        const parsed = JSON.parse(reqData.description);
        reasonText = parsed.reason || '';
        imagesToRegister = parsed.images || [];
      }
    } catch (e) {
      console.warn('[approveRequest] Failed to parse request description as JSON:', e);
    }

    // 1. Create product in master products table (marked as branch product)
    const aiClassName = reqData.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const { data: productData, error: productErr } = await supabaseAdmin
      .from('products')
      .insert([{
        sku: finalSku,
        name: reqData.name,
        category: finalCategory,
        price: finalPrice,
        image_url: reqData.image_url || null,
        ai_label: aiClassName,
        ai_class_name: aiClassName,
        ai_enabled: true,
        ocr_keywords: generateOcrKeywords(reqData.name, aiClassName),
      }])
      .select()
      .single();

    if (productErr) throw productErr;

    // Only link to requesting branch (not all branches)
    // Product will only appear in this branch's inventory

    // Register all angle images in product_images linked to the new product!
    // Move images from requests/ folder to products/ folder
    if (imagesToRegister.length > 0) {
      const movedImages: any[] = [];

      for (const img of imagesToRegister) {
        try {
          // Download original from requests folder
          const response = await fetch(img.imageUrl);
          if (!response.ok) continue;
          const buffer = Buffer.from(await response.arrayBuffer());

          // Upload to products folder
          const newPath = `products/${productData.id}/${img.angle}-${img.filename}`;
          const uploadResult = await productService.uploadImageToStorage(buffer, newPath, 'image/jpeg');
          if (!uploadResult.ok || !uploadResult.url) continue;

          movedImages.push({
            angle: img.angle,
            filename: img.filename,
            storagePath: newPath,
            imageUrl: uploadResult.url
          });

          // Generate mirror (skip for video entries — can't mirror a video with sharp)
          if (img.angle !== 'video') {
            const mirroredBuffer = await productService.mirrorImageBuffer(buffer, 'image/jpeg');
            const mirrorPath = `products/${productData.id}/${img.angle}-mirror-${img.filename}`;
            const mirrorUpload = await productService.uploadImageToStorage(mirroredBuffer, mirrorPath, 'image/jpeg');
            if (mirrorUpload.ok && mirrorUpload.url) {
              movedImages.push({
                angle: img.angle,
                filename: `mirror-${img.filename}`,
                storagePath: mirrorPath,
                imageUrl: mirrorUpload.url
              });
            }
          }
        } catch (err) {
          console.warn(`[approveRequest] Failed to move/mirror ${img.angle}:`, err);
        }
      }

      // Insert all images to product_images
      if (movedImages.length > 0) {
        await productService.insertProductImages(productData.id, movedImages);
      }

      // Update product image_url with front image
      const frontImg = movedImages.find(i => i.angle === 'front' && !i.filename.startsWith('mirror-'));
      if (frontImg) {
        await supabaseAdmin.from('products').update({ image_url: frontImg.imageUrl }).eq('id', productData.id);
      }

      // Delete original files from requests/ folder
      const oldPaths = imagesToRegister.map((img: any) => img.storagePath).filter(Boolean);
      if (oldPaths.length > 0) {
        await productService.deleteImagesFromStorage(oldPaths);
        console.log(`[approveRequest] 🗑️ Deleted ${oldPaths.length} files from requests/ folder`);
      }

      console.log(`[approveRequest] ✅ ${movedImages.length} images moved to products/${productData.id}/`);
    }

    // Trigger vision server sync
    try {
      const visionUrl = process.env.VISION_SERVER_URL || 'http://localhost:5002';
      fetch(`${visionUrl}/sync`, { method: 'POST' }).catch(() => {});
    } catch {}

    // 2. Link product to the requesting branch via branch_inventory
    const { error: invErr } = await supabaseAdmin
      .from('branch_inventory')
      .insert([{
        product_id: productData.id,
        branch_id: reqData.branch_id,
        stock: 0,
        cost_price: finalPrice,
        last_updated: new Date().toISOString(),
      }]);

    if (invErr) {
      // Rollback product if inventory insert fails
      await supabaseAdmin.from('products').delete().eq('id', productData.id);
      throw invErr;
    }

    // 3. Update request status to 'approved'
    await supabaseAdmin
      .from('product_requests')
      .update({
        status: 'approved',
        reviewed_by: user.sub,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    res.json({
      status: 'success',
      message: `Produk "${reqData.name}" berhasil disetujui dan ditambahkan ke katalog master`,
      data: productData,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── PATCH /api/product-requests/:id/reject ──────────────────────────────────
export const rejectRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (user.role !== 'super_admin') {
      return res.status(403).json({ status: 'error', message: 'Only super admin can reject product requests' });
    }

    const { reason } = req.body;

    // Get request data to find images to delete
    const { data: reqData } = await supabaseAdmin
      .from('product_requests')
      .select('description')
      .eq('id', id)
      .single();

    // Delete images from storage
    if (reqData?.description) {
      try {
        const parsed = JSON.parse(reqData.description);
        const images = parsed.images || [];
        if (images.length > 0) {
          const storagePaths = images.map((img: any) => img.storagePath).filter(Boolean);
          if (storagePaths.length > 0) {
            await productService.deleteImagesFromStorage(storagePaths);
            console.log(`[rejectRequest] 🗑️ Deleted ${storagePaths.length} images from storage`);
          }
        }
      } catch (e) {
        console.warn('[rejectRequest] Failed to delete images:', e);
      }
    }

    const { error } = await supabaseAdmin
      .from('product_requests')
      .update({
        status: 'rejected',
        rejection_reason: reason || 'Ditolak oleh Super Admin',
        reviewed_by: user.sub,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;

    res.json({ status: 'success', message: 'Permintaan produk telah ditolak' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// ─── DELETE /api/product-requests/:id ────────────────────────────────────────
// Branch admin cancels their own pending request
export const cancelRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('product_requests')
      .delete()
      .eq('id', id)
      .eq('branch_id', user.branch_id)
      .eq('status', 'pending');

    if (error) throw error;

    res.json({ status: 'success', message: 'Permintaan dibatalkan' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
