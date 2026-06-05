import { Router } from 'express';
import { getBranches } from './branch.controller.js';

const router = Router();

router.get('/', getBranches);

export default router;
