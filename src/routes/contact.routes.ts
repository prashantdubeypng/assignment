// ============================================================
// src/routes/contact.routes.ts
// ============================================================

import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';

const router = Router();
const contactController = new ContactController();

/**
 * @swagger
 * /identify:
 *   post:
 *     summary: Reconcile and consolidate a user identity
 *     tags: [Identity]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IdentifyRequest'
 *           examples:
 *             emailOnly:
 *               summary: Email only
 *               value:
 *                 email: "mcfly@hillvalley.edu"
 *             phoneOnly:
 *               summary: Phone only
 *               value:
 *                 phoneNumber: "1234567890"
 *             both:
 *               summary: Email and phone
 *               value:
 *                 email: "mcfly@hillvalley.edu"
 *                 phoneNumber: "1234567890"
 *     responses:
 *       200:
 *         description: Consolidated identity response
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IdentifyResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 */
router.post('/identify', contactController.identify);

export default router;
