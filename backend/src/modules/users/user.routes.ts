import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, assignMemberPromo } from './user.controller.js';

const router = Router();

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id', updateUser);
router.delete('/:id', deleteUser);
router.post('/:id/promo', assignMemberPromo);

export default router;
