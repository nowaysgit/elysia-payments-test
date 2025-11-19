import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Store, Storable, StorableConstructor } from '../../src/infrastructure/store';
import { unlink } from 'fs/promises';

// Тестовая сущность - Пользователь
class User implements Storable {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public createdAt: Date = new Date()
  ) {}

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      createdAt: this.createdAt.toISOString()
    };
  }

  static fromJSON(json: any): User {
    return new User(
      json.id,
      json.name,
      json.email,
      new Date(json.createdAt)
    );
  }
}

// Тестовое событие - Активность пользователя
class UserActivity implements Storable {
  constructor(
    public id: string,
    public entityId: string, // ID пользователя
    public action: string,
    public timestamp: Date = new Date()
  ) {}

  toJSON() {
    return {
      id: this.id,
      entityId: this.entityId,
      action: this.action,
      timestamp: this.timestamp.toISOString()
    };
  }

  static fromJSON(json: any): UserActivity {
    return new UserActivity(
      json.id,
      json.entityId,
      json.action,
      new Date(json.timestamp)
    );
  }
}

describe('Store', () => {
  const testUserFilePath = './stores/test-user-store.json';
  const testActivityFilePath = './stores/test-activity-store.json';
  let userStore: Store<User>;
  let activityStore: Store<UserActivity>;

  beforeEach(async () => {
    userStore = new Store(User, testUserFilePath);
    await userStore.initialize();
    userStore.clear();

    activityStore = new Store(UserActivity, testActivityFilePath);
    await activityStore.initialize();
    activityStore.clear();
  });

  afterEach(async () => {
    try {
      await unlink(testUserFilePath);
      await unlink(testActivityFilePath);
    } catch {
      // Файлы могут не существовать
    }
  });

  test('должен сохранить и получить сущность', () => {
    const user = new User('user-1', 'Иван Иванов', 'ivan@example.com');

    userStore.save(user);
    const retrieved = userStore.get('user-1');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('Иван Иванов');
  });

  test('должен вернуть null для несуществующей сущности', () => {
    const retrieved = userStore.get('non-existent');
    expect(retrieved).toBeNull();
  });

  test('должен получить все сущности', () => {
    const user1 = new User('user-1', 'Иван', 'ivan@example.com');
    const user2 = new User('user-2', 'Петр', 'petr@example.com');

    userStore.save(user1);
    userStore.save(user2);

    const all = userStore.getAll();
    expect(all.length).toBe(2);
  });

  test('должен обновить существующую сущность', () => {
    const user = new User('user-1', 'Иван', 'ivan@example.com');
    userStore.save(user);

    const updatedUser = new User('user-1', 'Иван Иванов', 'newemail@example.com');
    userStore.save(updatedUser);

    const retrieved = userStore.get('user-1');
    expect(retrieved?.name).toBe('Иван Иванов');
    expect(userStore.size).toBe(1);
  });

  test('должен найти элементы по предикату', () => {
    const user1 = new User('user-1', 'Иван', 'ivan@example.com');
    const user2 = new User('user-2', 'Петр', 'petr@example.com');
    const user3 = new User('user-3', 'Иван', 'ivan2@example.com');

    userStore.save(user1);
    userStore.save(user2);
    userStore.save(user3);

    const ivans = userStore.find(u => u.name === 'Иван');
    expect(ivans.length).toBe(2);
  });

  test('должен сохранить и получить события', () => {
    const activity1 = new UserActivity('act-1', 'user-1', 'login');
    const activity2 = new UserActivity('act-2', 'user-1', 'logout');
    const activity3 = new UserActivity('act-3', 'user-2', 'login');

    activityStore.save(activity1);
    activityStore.save(activity2);
    activityStore.save(activity3);

    const user1Activities = activityStore.find(a => a.entityId === 'user-1');
    expect(user1Activities.length).toBe(2);
  });

  test('должен очистить хранилище', () => {
    const user = new User('user-1', 'Иван', 'ivan@example.com');
    const activity = new UserActivity('act-1', 'user-1', 'login');

    userStore.save(user);
    activityStore.save(activity);

    expect(userStore.size).toBe(1);
    expect(activityStore.size).toBe(1);

    userStore.clear();
    activityStore.clear();

    expect(userStore.size).toBe(0);
    expect(activityStore.size).toBe(0);
    expect(userStore.getAll()).toEqual([]);
    expect(activityStore.getAll()).toEqual([]);
  });

  test('должен сохранить данные в файл', async () => {
    const user = new User('user-1', 'Иван', 'ivan@example.com');

    userStore.save(user);
    await userStore.saveToFile();

    // Проверяем, что файл создан
    const file = Bun.file(testUserFilePath);
    const exists = await file.exists();
    expect(exists).toBe(true);

    // Проверяем содержимое
    const content = await file.json();
    expect(content.items).toHaveLength(1);
    expect(content.items[0].name).toBe('Иван');
    expect(content.savedAt).toBeDefined();
  });

  test('должен загрузить данные из файла', async () => {
    // Сохраняем данные
    const user1 = new User('user-1', 'Иван', 'ivan@example.com');
    const user2 = new User('user-2', 'Петр', 'petr@example.com');

    userStore.save(user1);
    userStore.save(user2);
    await userStore.saveToFile();

    // Создаем новое хранилище и загружаем данные
    const newStore = new Store(User, testUserFilePath);
    await newStore.initialize();

    expect(newStore.size).toBe(2);

    const loadedUser = newStore.get('user-1');
    expect(loadedUser?.name).toBe('Иван');
    expect(loadedUser?.email).toBe('ivan@example.com');
  });

  test('должен начать с пустого состояния если файл не существует', async () => {
    const newStore = new Store(User, './stores/non-existent-file.json');
    await newStore.initialize();

    expect(newStore.size).toBe(0);
  });

  test('должен работать с пустым файлом', async () => {
    // Создаем пустой файл
    await Bun.write(testUserFilePath, '');

    const newStore = new Store(User, testUserFilePath);
    await newStore.initialize();

    expect(newStore.size).toBe(0);
  });

  test('должен обработать поврежденный JSON файл', async () => {
    // Создаем файл с невалидным JSON
    await Bun.write(testUserFilePath, '{ invalid json }');

    const newStore = new Store(User, testUserFilePath);
    await newStore.initialize();

    // Должен начать с пустого состояния
    expect(newStore.size).toBe(0);
  });

  test('не должен вызывать initialize дважды', async () => {
    const user = new User('user-1', 'Иван', 'ivan@example.com');
    userStore.save(user);
    await userStore.saveToFile();

    // Первая инициализация уже произошла в beforeEach
    expect(userStore.size).toBe(1);

    // Вторая инициализация не должна ничего сделать
    await userStore.initialize();
    expect(userStore.size).toBe(1);
  });

  test('должен корректно сериализовать и десериализовать даты', async () => {
    const now = new Date('2025-01-15T10:30:00.000Z');
    const user = new User('user-1', 'Иван', 'ivan@example.com', now);
    
    userStore.save(user);
    await userStore.saveToFile();

    const newStore = new Store(User, testUserFilePath);
    await newStore.initialize();

    const loaded = newStore.get('user-1');
    expect(loaded?.createdAt.toISOString()).toBe(now.toISOString());
  });
});
