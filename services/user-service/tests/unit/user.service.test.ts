import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserService } from '../../src/services/user.service';
import { User } from '../../src/models/user.model';
import { invalidateUser } from '../../src/cache/user.cache';

jest.mock('../../src/cache/user.cache', () => ({
  getUser: jest.fn(),
  setUser: jest.fn(),
  invalidateUser: jest.fn(),
}));

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await User.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await User.deleteMany({});
  jest.clearAllMocks();
});

describe('UserService.register', () => {
  const validInput = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'secureP@ssw0rd',
  };

  it('should create a user and return a safe object without passwordHash', async () => {
    const result = await UserService.register(validInput);

    expect(result).toMatchObject({
      id: expect.any(String),
      name: 'Jane Doe',
      email: 'jane@example.com',
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('password');
  });

  it('should hash the password before storing (not plaintext)', async () => {
    await UserService.register(validInput);

    const stored = await User.findOne({ email: 'jane@example.com' }).lean();
    expect(stored).not.toBeNull();
    expect(stored!.passwordHash).not.toBe(validInput.password);
    expect(stored!.passwordHash).toMatch(/^\$2[ab]\$\d+\$/); // bcrypt hash pattern
  });

  it('should lowercase the email before storing', async () => {
    const result = await UserService.register({ ...validInput, email: 'JANE@EXAMPLE.COM' });

    expect(result.email).toBe('jane@example.com');
  });

  it('should throw an error with code 11000 on duplicate email', async () => {
    await UserService.register(validInput);

    await expect(UserService.register(validInput)).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('should throw a validation error when name is missing', async () => {
    await expect(
      UserService.register({ name: '', email: 'jane@example.com', password: 'secureP@ssw0rd' }),
    ).rejects.toThrow();
  });

  it('should throw a validation error when password is too short', async () => {
    await expect(
      UserService.register({ name: 'Jane', email: 'jane@example.com', password: 'short' }),
    ).rejects.toThrow();
  });
});

describe('UserService.update', () => {
  const base = { name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' };

  async function createUser() {
    return UserService.register(base);
  }

  it('should update the name and return a safe object without passwordHash', async () => {
    const user = await createUser();
    const id = user['id'] as string;

    const result = await UserService.update(id, id, { name: 'Jane Smith' });

    expect(result).toMatchObject({ id, name: 'Jane Smith', email: 'jane@example.com' });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('should lowercase the email when updating', async () => {
    const user = await createUser();
    const id = user['id'] as string;

    const result = await UserService.update(id, id, { email: 'JANE.SMITH@EXAMPLE.COM' });

    expect(result).toMatchObject({ email: 'jane.smith@example.com' });
  });

  it('should re-hash the password when a new password is provided', async () => {
    const user = await createUser();
    const id = user['id'] as string;

    await UserService.update(id, id, { password: 'newSecureP@ss1' });

    const stored = await User.findById(id).lean();
    expect(stored).not.toBeNull();
    const passwordMatches = await bcrypt.compare('newSecureP@ss1', stored!.passwordHash);
    expect(passwordMatches).toBe(true);
  });

  it('should call invalidateUser with the user id after a successful update', async () => {
    const user = await createUser();
    const id = user['id'] as string;

    await UserService.update(id, id, { name: 'Jane Smith' });

    expect(invalidateUser).toHaveBeenCalledWith(id);
  });

  it('should throw AppError 403 when requestingUserId does not match id', async () => {
    const user = await createUser();
    const id = user['id'] as string;
    const otherId = new mongoose.Types.ObjectId().toString();

    await expect(UserService.update(id, otherId, { name: 'Hacker' })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Forbidden',
    });
  });

  it('should throw AppError 404 when user does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(
      UserService.update(nonExistentId, nonExistentId, { name: 'Ghost' }),
    ).rejects.toMatchObject({ statusCode: 404, message: 'User not found' });
  });

  it('should throw an error with code 11000 on duplicate email', async () => {
    await UserService.register({ name: 'Bob', email: 'bob@example.com', password: 'secureP@ssw0rd' });
    const user = await createUser();
    const id = user['id'] as string;

    await expect(UserService.update(id, id, { email: 'bob@example.com' })).rejects.toMatchObject({
      code: 11000,
    });
  });
});

describe('UserService.delete', () => {
  const base = { name: 'Jane Doe', email: 'jane@example.com', password: 'secureP@ssw0rd' };

  async function createUser() {
    return UserService.register(base);
  }

  it('should delete the user and call invalidateUser', async () => {
    const user = await createUser();
    const id = user['id'] as string;

    await UserService.delete(id, id);

    const found = await User.findById(id);
    expect(found).toBeNull();
    expect(invalidateUser).toHaveBeenCalledWith(id);
  });

  it('should throw AppError 403 when requestingUserId does not match id', async () => {
    const user = await createUser();
    const id = user['id'] as string;
    const otherId = new mongoose.Types.ObjectId().toString();

    await expect(UserService.delete(id, otherId)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Forbidden',
    });
  });

  it('should throw AppError 404 when user does not exist', async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();

    await expect(UserService.delete(nonExistentId, nonExistentId)).rejects.toMatchObject({
      statusCode: 404,
      message: 'User not found',
    });
  });
});

