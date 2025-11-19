import { describe, test, expect } from 'bun:test';
import { Store, Storable } from '../../src/infrastructure/store';
import { StoreManager } from '../../src/infrastructure/store.manager';

// Простая тестовая сущность
class TestEntity implements Storable {
  constructor(
    public id: string,
    public name: string
  ) {}

  toJSON() {
    return { id: this.id, name: this.name };
  }

  static fromJSON(json: any): TestEntity {
    return new TestEntity(json.id, json.name);
  }
}

describe('StoreManager', () => {
  test('должен инициализировать и сохранить все хранилища', async () => {
    const manager = new StoreManager();
    
    const store1 = manager.add(new Store(TestEntity, './stores/test-manager-1.json'));
    const store2 = manager.add(new Store(TestEntity, './stores/test-manager-2.json'));

    // Инициализация через менеджер
    await manager.initialize();

    // Проверяем, что оба хранилища зарегистрированы
    expect(manager.count).toBe(2);

    // Добавляем данные
    store1.save(new TestEntity('1', 'Test 1'));
    store2.save(new TestEntity('2', 'Test 2'));

    // Сохраняем через менеджер
    await manager.saveAll();

    // Проверяем, что файлы созданы
    const file1 = Bun.file('./stores/test-manager-1.json');
    const file2 = Bun.file('./stores/test-manager-2.json');

    expect(await file1.exists()).toBe(true);
    expect(await file2.exists()).toBe(true);

    // Очищаем
    store1.clear();
    store2.clear();
  });

  test('должен загрузить данные при инициализации', async () => {
    const manager = new StoreManager();
    
    const store = manager.add(new Store(TestEntity, './stores/test-manager-load.json'));
    
    // Сохраняем тестовые данные
    await store.initialize();
    store.save(new TestEntity('1', 'Test'));
    await store.saveToFile();

    // Создаем новый менеджер и загружаем
    const manager2 = new StoreManager();
    const store2 = manager2.add(new Store(TestEntity, './stores/test-manager-load.json'));
    await manager2.initialize();

    // Проверяем, что данные загрузились
    expect(store2.size).toBe(1);
    expect(store2.get('1')?.name).toBe('Test');

    store2.clear();
  });
});
