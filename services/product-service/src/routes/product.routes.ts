import { Router, Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/product.service';
import { ListQuerySchema, IdParamSchema, CreateProductSchema, UpdateProductSchema } from '../validators/product.validators';

export const productRouter = Router();

// GET /api/products — list all products (paginated)
productRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = ListQuerySchema.parse(req.query);
    const result = await ProductService.listProducts(query.page, query.limit);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id — retrieve a single product
productRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const product = await ProductService.getProductById(id);
    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/products — create a new product
productRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateProductSchema.parse(req.body);
    const product = await ProductService.createProduct(body);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/products/:id — partial update a product
productRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = UpdateProductSchema.parse(req.body);
    const product = await ProductService.updateProduct(id, body);
    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id — delete a product
productRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = IdParamSchema.parse(req.params);
    await ProductService.deleteProduct(id);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (err) {
    next(err);
  }
});

