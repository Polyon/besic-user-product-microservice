import {
  CreateProductSchema,
  UpdateProductSchema,
  ListQuerySchema,
  IdParamSchema,
} from '../../src/validators/product.validators';

describe('CreateProductSchema', () => {
  const valid = {
    name: 'Widget Pro',
    description: 'A great widget',
    price: 9.99,
    category: 'Widgets',
    stock: 10,
  };

  it('accepts a fully valid product', () => {
    expect(CreateProductSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a product without optional description', () => {
    const { description: _d, ...rest } = valid;
    expect(CreateProductSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name: _n, ...rest } = valid;
    expect(CreateProductSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing price', () => {
    const { price: _p, ...rest } = valid;
    expect(CreateProductSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing category', () => {
    const { category: _c, ...rest } = valid;
    expect(CreateProductSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects missing stock', () => {
    const { stock: _s, ...rest } = valid;
    expect(CreateProductSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects negative price', () => {
    expect(CreateProductSchema.safeParse({ ...valid, price: -1 }).success).toBe(false);
  });

  it('rejects zero price', () => {
    expect(CreateProductSchema.safeParse({ ...valid, price: 0 }).success).toBe(false);
  });

  it('rejects negative stock', () => {
    expect(CreateProductSchema.safeParse({ ...valid, stock: -5 }).success).toBe(false);
  });

  it('rejects non-integer stock', () => {
    expect(CreateProductSchema.safeParse({ ...valid, stock: 1.5 }).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(CreateProductSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = CreateProductSchema.safeParse({ ...valid, unknown: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('unknown');
    }
  });

  it('trims whitespace from name', () => {
    const result = CreateProductSchema.safeParse({ ...valid, name: '  Widget  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Widget');
    }
  });
});

describe('UpdateProductSchema', () => {
  it('accepts a single-field update', () => {
    expect(UpdateProductSchema.safeParse({ price: 19.99 }).success).toBe(true);
  });

  it('accepts multiple fields', () => {
    expect(UpdateProductSchema.safeParse({ name: 'New Name', stock: 5 }).success).toBe(true);
  });

  it('rejects empty body (no fields)', () => {
    const result = UpdateProductSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects negative price', () => {
    expect(UpdateProductSchema.safeParse({ price: -1 }).success).toBe(false);
  });

  it('rejects zero price', () => {
    expect(UpdateProductSchema.safeParse({ price: 0 }).success).toBe(false);
  });

  it('rejects negative stock', () => {
    expect(UpdateProductSchema.safeParse({ stock: -3 }).success).toBe(false);
  });

  it('rejects empty name string', () => {
    expect(UpdateProductSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('ListQuerySchema', () => {
  it('applies defaults when no params supplied', () => {
    const result = ListQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it('coerces string page and limit to numbers', () => {
    const result = ListQuerySchema.safeParse({ page: '2', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects page=0', () => {
    expect(ListQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects limit=0', () => {
    expect(ListQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(ListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('IdParamSchema', () => {
  const validId = 'a'.repeat(24);

  it('accepts a valid 24-character hex ObjectId', () => {
    expect(IdParamSchema.safeParse({ id: validId }).success).toBe(true);
  });

  it('accepts mixed-case hex', () => {
    expect(IdParamSchema.safeParse({ id: 'AABBCCDDEEFF001122334455' }).success).toBe(true);
  });

  it('rejects a string shorter than 24 hex chars', () => {
    expect(IdParamSchema.safeParse({ id: 'abc123' }).success).toBe(false);
  });

  it('rejects a string longer than 24 hex chars', () => {
    expect(IdParamSchema.safeParse({ id: 'a'.repeat(25) }).success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(IdParamSchema.safeParse({ id: 'z'.repeat(24) }).success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(IdParamSchema.safeParse({ id: '' }).success).toBe(false);
  });
});
