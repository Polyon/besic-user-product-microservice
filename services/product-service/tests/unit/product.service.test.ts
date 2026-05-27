/**
 * T022 — Unit tests for ProductService list and get operations.
 *
 * Tests against a real in-memory MongoDB (MongoMemoryServer) so that
 * query behaviour (skip, limit, sort, countDocuments) is exercised properly.
 */
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ProductService, ProductDocument } from '../../src/services/product.service';
import { Product } from '../../src/models/product.model';
import { NotFoundError } from '../../src/errors';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Product.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Product.deleteMany({});
});

// ---------------------------------------------------------------------------
// ProductService.listProducts
// ---------------------------------------------------------------------------
describe('ProductService.listProducts', () => {
  const seed = async (count: number) => {
    const docs = Array.from({ length: count }, (_, i) => ({
      name: `Product ${i + 1}`,
      price: (i + 1) * 10,
      category: 'Test',
      stock: i,
    }));
    return Product.insertMany(docs);
  };

  it('returns an empty pagination envelope when no products exist', async () => {
    const result = await ProductService.listProducts(1, 20);
    expect(result).toMatchObject({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it('returns correct pagination envelope for a seeded DB', async () => {
    await seed(5);

    const result = await ProductService.listProducts(1, 20);
    expect(result.total).toBe(5);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(1);
    expect(result.data).toHaveLength(5);
  });

  it('applies page and limit correctly — second page', async () => {
    await seed(5);

    const result = await ProductService.listProducts(2, 2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.data).toHaveLength(2);
  });

  it('returns last page with fewer items than limit', async () => {
    await seed(5);

    const result = await ProductService.listProducts(3, 2);
    expect(result.total).toBe(5);
    expect(result.page).toBe(3);
    expect(result.data).toHaveLength(1);
  });

  it('returns items sorted by createdAt descending (newest first)', async () => {
    await seed(3);

    const result = await ProductService.listProducts(1, 20);
    const names = result.data.map((p: ProductDocument) => p.name);
    // Product 3 was inserted last, should appear first
    expect(names[0]).toBe('Product 3');
  });

  it('each item in data has the expected product fields', async () => {
    await seed(1);

    const result = await ProductService.listProducts(1, 20);
    const item = (result.data[0].toJSON()) as Record<string, unknown>;
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('price');
    expect(item).toHaveProperty('category');
    expect(item).toHaveProperty('stock');
    expect(item).toHaveProperty('createdAt');
    expect(item).toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('_id');
    expect(item).not.toHaveProperty('__v');
  });
});

// ---------------------------------------------------------------------------
// ProductService.getProductById
// ---------------------------------------------------------------------------
describe('ProductService.getProductById', () => {
  it('returns the product document when it exists', async () => {
    const created = await Product.create({
      name: 'Wireless Mouse',
      price: 39.99,
      category: 'Electronics',
      stock: 50,
    });

    const result = await ProductService.getProductById(created._id.toString());

    expect(result).toBeTruthy();
    expect(result.name).toBe('Wireless Mouse');
    expect(result.price).toBe(39.99);
  });

  it('throws NotFoundError when product does not exist', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(ProductService.getProductById(fakeId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the returned document has id (string) not _id', async () => {
    const created = await Product.create({
      name: 'USB Hub',
      price: 24.99,
      category: 'Electronics',
      stock: 20,
    });

    const result = await ProductService.getProductById(created._id.toString());
    const asObj = result.toJSON() as Record<string, unknown>;
    expect(asObj).toHaveProperty('id');
    expect(asObj).not.toHaveProperty('_id');
    expect(asObj).not.toHaveProperty('__v');
  });
});

// ---------------------------------------------------------------------------
// T028 — ProductService.createProduct
// ---------------------------------------------------------------------------
describe('ProductService.createProduct', () => {
  const validInput = {
    name: 'USB Hub',
    description: '7-port USB 3.0 hub',
    price: 24.99,
    category: 'Electronics',
    stock: 75,
  };

  it('persists a new product and returns it with all required fields', async () => {
    const result = await ProductService.createProduct(validInput);

    expect(result).toBeTruthy();
    expect(result.name).toBe('USB Hub');
    expect(result.price).toBe(24.99);
    expect(result.category).toBe('Electronics');
    expect(result.stock).toBe(75);
    expect(result._id).toBeTruthy();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('the saved document is retrievable from MongoDB', async () => {
    const created = await ProductService.createProduct(validInput);
    const found = await Product.findById(created._id).exec();
    expect(found).not.toBeNull();
    expect(found!.name).toBe('USB Hub');
  });

  it('toJSON strips _id and __v, exposes id as string', async () => {
    const result = await ProductService.createProduct(validInput);
    const asObj = result.toJSON() as Record<string, unknown>;
    expect(asObj).toHaveProperty('id');
    expect(typeof asObj['id']).toBe('string');
    expect(asObj).not.toHaveProperty('_id');
    expect(asObj).not.toHaveProperty('__v');
  });

  it('creates without optional description', async () => {
    const { description: _d, ...inputWithoutDesc } = validInput;
    const result = await ProductService.createProduct(inputWithoutDesc);
    expect(result.name).toBe('USB Hub');
    expect(result.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// T032 — ProductService.updateProduct
// ---------------------------------------------------------------------------
describe('ProductService.updateProduct', () => {
  const base = {
    name: 'Original',
    price: 10.00,
    category: 'Tools',
    stock: 50,
  };

  it('returns the updated document with only the changed field modified', async () => {
    const created = await Product.create(base);
    const result = await ProductService.updateProduct(created._id.toString(), { price: 29.99 });

    expect(result.price).toBe(29.99);
    expect(result.name).toBe('Original');   // unchanged
    expect(result.stock).toBe(50);          // unchanged
  });

  it('returns the full document (new: true) — not the pre-update snapshot', async () => {
    const created = await Product.create(base);
    const result = await ProductService.updateProduct(created._id.toString(), { stock: 99 });
    expect(result.stock).toBe(99);
  });

  it('throws NotFoundError when no document matches the id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      ProductService.updateProduct(fakeId, { price: 5.00 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('toJSON of the result strips _id and __v', async () => {
    const created = await Product.create(base);
    const result = await ProductService.updateProduct(created._id.toString(), { name: 'Renamed' });
    const asObj = result.toJSON() as Record<string, unknown>;
    expect(asObj).toHaveProperty('id');
    expect(asObj).not.toHaveProperty('_id');
    expect(asObj).not.toHaveProperty('__v');
  });
});

// ---------------------------------------------------------------------------
// T036 — ProductService.deleteProduct
// ---------------------------------------------------------------------------
describe('ProductService.deleteProduct', () => {
  const base = {
    name: 'Delete Me',
    price: 5.00,
    category: 'Test',
    stock: 1,
  };

  it('deletes the document and it is no longer findable', async () => {
    const created = await Product.create(base);
    await ProductService.deleteProduct(created._id.toString());
    const found = await Product.findById(created._id).exec();
    expect(found).toBeNull();
  });

  it('throws NotFoundError when no document matches the id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    await expect(
      ProductService.deleteProduct(fakeId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns the deleted document (confirming findByIdAndDelete return value)', async () => {
    const created = await Product.create(base);
    const deleted = await ProductService.deleteProduct(created._id.toString());
    expect(deleted._id.toString()).toBe(created._id.toString());
    expect(deleted.name).toBe('Delete Me');
  });
});
