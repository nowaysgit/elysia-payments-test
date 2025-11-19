/**
 * Интерфейс для сущностей, которые могут быть сохранены в хранилище
 */
export interface Storable {
  id: string;
  toJSON(): any;
}

/**
 * Интерфейс для класса, который может создать сущность из JSON
 */
export interface StorableConstructor<T extends Storable> {
  fromJSON(json: any): T;
}

/**
 * Универсальное In-Memory хранилище с персистентностью в JSON файл
 * Работает с любыми сущностями, реализующими интерфейс Storable
 */
export class Store<T extends Storable> {
  private items: Map<string, T> = new Map();
  private readonly filePath: string;
  private readonly itemConstructor: StorableConstructor<T>;
  private isLoaded = false;

  constructor(
    itemConstructor: StorableConstructor<T>,
    filePath: string = './store.json'
  ) {
    this.itemConstructor = itemConstructor;
    this.filePath = filePath;
  }

  /**
   * Инициализация хранилища (загрузка данных)
   * Вызывается явно, чтобы избежать async операций в конструкторе
   */
  async initialize(): Promise<void> {
    if (this.isLoaded) return;
    await this.loadFromFile();
    this.isLoaded = true;
  }

  /**
   * Сохранить элемент
   */
  save(item: T): void {
    this.items.set(item.id, item);
  }

  /**
   * Получить элемент по ID
   */
  get(id: string): T | null {
    return this.items.get(id) || null;
  }

  /**
   * Получить все элементы
   */
  getAll(): T[] {
    return Array.from(this.items.values());
  }

  /**
   * Найти элементы по предикату
   */
  find(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  /**
   * Удалить элемент по ID
   */
  delete(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Проверить существование элемента
   */
  has(id: string): boolean {
    return this.items.has(id);
  }

  /**
   * Загрузка данных из файла
   */
  private async loadFromFile(): Promise<void> {
    try {
      const file = Bun.file(this.filePath);
      
      // Проверяем существование и размер файла
      if (file.size === 0) {
        console.log('📂 Файл хранилища пуст, начинаем с чистого состояния');
        return;
      }

      const content = await file.text();
      const data = JSON.parse(content);
      
      // Восстановление данных
      if (data.items && Array.isArray(data.items)) {
        data.items.forEach((json: any) => {
          const item = this.itemConstructor.fromJSON(json);
          this.items.set(item.id, item);
        });
      }

      console.log(`📂 Загружено из файла: ${this.items.size} элементов`);
    } catch (error) {
      // Если файл не существует или повреждён, начинаем с чистого состояния
      console.log('📂 Файл хранилища не найден или повреждён, начинаем с чистого состояния');
    }
  }

  /**
   * Сохранение данных в файл
   */
  async saveToFile(): Promise<void> {
    const data = {
      items: Array.from(this.items.values()).map(item => item.toJSON()),
      savedAt: new Date().toISOString()
    };

    await Bun.write(this.filePath, JSON.stringify(data, null, 2));
    console.log(`💾 Данные сохранены: ${this.items.size} элементов`);
  }

  /**
   * Очистка хранилища (для тестов)
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Получить количество элементов
   */
  get size(): number {
    return this.items.size;
  }
}
