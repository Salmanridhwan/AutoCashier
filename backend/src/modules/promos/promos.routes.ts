import { Router } from 'express';
import { 
  listPromos, 
  createPromoController, 
  deletePromoController,
  getPromoInsights,
  validatePromoController,
  getPromoByIdController,
  updatePromoController
} from './promo.controller.js';

const router = Router();

router.get('/', listPromos);
router.get('/insights', getPromoInsights);
router.get('/:id', getPromoByIdController);
router.post('/', createPromoController);
router.post('/validate', validatePromoController);
router.put('/:id', updatePromoController);
router.delete('/:id', deletePromoController);

export default router;
