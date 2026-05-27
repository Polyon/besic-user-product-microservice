import { Product, IProduct } from '../models/product.model';
import { NotFoundError } from '../errors';
import { CreateProductInput, UpdateProductInput } from '../validators/product.validators';
import type { Document, Types } from 'mongoose';

export interface ProductDocument extends IProduct, Document {
  _id: Types.ObjectId;
}

export interface PaginatedProducts {
  data: ProductDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const ProductService = {
  /**
   * List products with cursor-based pagination.
   * Results are sorted by createdAt descending (newest first).
   */
  async listProducts(page: number, limit: number): Promise<PaginatedProducts> {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      Product.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec() as Promise<ProductDocument[]>,
      Product.countDocuments().exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  /**
   * Retrieve a single product by its MongoDB ObjectId string.
   * Throws NotFoundError if no document matches.
   */
  async getProductById(id: string): Promise<ProductDocument> {
    const product = (await Product.findById(id).exec()) as ProductDocument | null;

    if (!product) {
      throw new NotFoundError(`Product with id '${id}' not found`);
    }

    return product;
  },

  /**
   * Create and persist a new product.
   * Input has already been validated and stripped by CreateProductSchema.
   */
  async createProduct(data: CreateProductInput): Promise<ProductDocument> {
    const product = new Product(data);
    return (await product.save()) as ProductDocument;
  },

  /**
   * Partially update an existing product by its MongoDB ObjectId string.
   * Only the supplied fields are modified; all others retain their current values.
   * Throws NotFoundError if no document matches the given id.
   */
  async updateProduct(id: string, data: UpdateProductInput): Promise<ProductDocument> {
    const product = (await Product.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    ).exec()) as ProductDocument | null;

    if (!product) {
      throw new NotFoundError(`Product with id '${id}' not found`);
    }

    return product;
  },

  /**
   * Permanently delete a product by its MongoDB ObjectId string.
   * Throws NotFoundError if no document matches the given id.
   */
  async deleteProduct(id: string): Promise<ProductDocument> {
    const product = (await Product.findByIdAndDelete(id).exec()) as ProductDocument | null;

    if (!product) {
      throw new NotFoundError(`Product with id '${id}' not found`);
    }

    return product;
  },
};
