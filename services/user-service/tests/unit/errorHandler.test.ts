import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

// Types will be resolved once T015 implements the module
let errorHandler: (err: Error, req: Request, res: Response, next: NextFunction) => void;
let AppError: new (statusCode: number, message: string) => Error & { statusCode: number };

beforeAll(async () => {
  const mod = await import('../../src/middleware/errorHandler');
  errorHandler = mod.errorHandler;
  AppError = mod.AppError as typeof AppError;
});

describe('errorHandler middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    mockReq = {};
    mockRes = { status: statusMock };
    mockNext = jest.fn();
  });

  it('should return 409 for MongoDB duplicate key error (code 11000)', () => {
    const err = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(409);
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'A user with this email already exists',
    });
  });

  it('should return AppError status code and message', () => {
    const err = new AppError(422, 'Unprocessable entity');
    errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(422);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Unprocessable entity' });
  });

  it('should return 500 for unknown errors with generic message', () => {
    const err = new Error('Something sensitive and internal');
    errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(500);
    expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  it('should not expose stack trace in response body for unknown errors', () => {
    const err = new Error('Internal error with stack');
    errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

    const responseBody = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(responseBody.stack).toBeUndefined();
    expect(responseBody.message).toBeUndefined();
  });

  it('should not expose internal error message in response for unknown errors', () => {
    const err = new Error('DB_PASSWORD=secret connection string leaked');
    errorHandler(err, mockReq as Request, mockRes as Response, mockNext);

    const responseBody = jsonMock.mock.calls[0][0] as Record<string, unknown>;
    expect(responseBody.error).toBe('Internal server error');
    expect(JSON.stringify(responseBody)).not.toContain('DB_PASSWORD');
  });

  it('should return 400 with details for a ZodError', () => {
    // Parse a deliberately invalid object to produce a real ZodError
    const { z } = require('zod') as typeof import('zod');
    let zodErr!: ZodError;
    try {
      z.object({ name: z.string().min(1) }).parse({});
    } catch (e) {
      zodErr = e as ZodError;
    }

    errorHandler(zodErr, mockReq as Request, mockRes as Response, mockNext);

    expect(statusMock).toHaveBeenCalledWith(400);
    const body = jsonMock.mock.calls[0][0] as { error: string; details: string[] };
    expect(body.error).toBe('Validation error');
    expect(Array.isArray(body.details)).toBe(true);
  });
});
