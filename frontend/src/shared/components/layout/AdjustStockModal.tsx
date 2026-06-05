import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useLanguage } from '@/shared/context/LanguageContext';

interface AdjustStockModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: any) => void;
  item: any;
  isLoading: boolean;
}

export function AdjustStockModal({ isOpen, onOpenChange, onConfirm, item, isLoading }: AdjustStockModalProps) {
  const { t } = useLanguage();
  const [type, setType] = useState('RESTOCK');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quantity || Number(quantity) <= 0) return;
    onConfirm({
      inventoryId: item.inventory_id,
      branchId: item.branch_id,
      productId: item.id,
      type,
      quantity: Number(quantity),
      reason
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl p-8 border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-black tracking-tighter text-2xl text-gray-900">{t('adjustStock.title')}</DialogTitle>
          <DialogDescription className="text-gray-500 font-medium">
            {t('adjustStock.subtitle')
              .replace('{name}', item.name)
              .replace('{stock}', String(item.stock))}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-6 py-4">
          <div className="grid gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('adjustStock.movementType')}</label>
            <Select value={type} onValueChange={(v) => { if (v) setType(v); }}>
              <SelectTrigger className="h-12 rounded-2xl bg-gray-50 border-none">
                <SelectValue placeholder={t('adjustStock.selectType')} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-xl">
                <SelectItem value="RESTOCK" className="font-bold">{t('adjustStock.restock')}</SelectItem>
                <SelectItem value="SALE" className="font-bold">{t('adjustStock.sale')}</SelectItem>
                <SelectItem value="DAMAGE" className="font-bold">{t('adjustStock.damage')}</SelectItem>
                <SelectItem value="ADJUSTMENT" className="font-bold">{t('adjustStock.adjustment')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('adjustStock.quantity')}</label>
            <Input 
              type="number" 
              min="1"
              required 
              value={quantity} 
              onChange={e => setQuantity(e.target.value)}
              className="h-12 rounded-2xl bg-gray-50 border-none font-mono text-lg font-bold" 
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('adjustStock.reason')}</label>
            <Input 
              value={reason} 
              onChange={e => setReason(e.target.value)}
              className="h-12 rounded-2xl bg-gray-50 border-none font-medium" 
              placeholder={t('adjustStock.reasonPlaceholder')}
            />
          </div>
          <DialogFooter className="mt-4 gap-3 sm:gap-0">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="rounded-2xl font-bold text-gray-500"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 shadow-lg shadow-indigo-600/20"
            >
              {isLoading ? t('common.loading') : t('adjustStock.confirmUpdate')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
