import { Router } from 'express';
import * as visionController from './vision.controller.js';

const router = Router();

// Vision server proxy routes
router.post('/register', visionController.register);
router.get('/products', visionController.getVisionProducts);
router.delete('/products/:id', visionController.deleteVisionProduct);
router.get('/health', visionController.healthCheck);
router.post('/sync', visionController.sync);
router.post('/refresh-cache', visionController.refreshCache);

// Admin-triggered dataset build + training
router.post('/build-dataset', visionController.buildDataset);
router.get('/build-status', visionController.buildStatus);
router.post('/train', visionController.trainModel);
router.get('/train-status', visionController.trainStatus);
router.get('/train-log', visionController.trainLog);
router.post('/evaluate', visionController.startEvaluation);
router.get('/evaluation-status', visionController.evaluationStatus);
router.get('/evaluation-report', visionController.evaluationReport);

// Cloud model sync
router.post('/sync-model', visionController.syncModel);
router.get('/sync-model-status', visionController.syncModelStatus);
router.get('/model-version', visionController.modelVersion);

export default router;
