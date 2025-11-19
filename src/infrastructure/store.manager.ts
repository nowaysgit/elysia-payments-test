import { Store, Storable } from './store';

/**
 * Глобальный менеджер хранилищ
 * Управляет всеми GenericStore в приложении и обеспечивает корректное сохранение при завершении
 */
export class StoreManager {
  private stores: Store<any>[] = [];
  private hooksRegistered = false;

  /**
   * Добавление хранилища в менеджер
   */
  add<T extends Storable>(store: Store<T>): Store<T> {
    this.stores.push(store);
    return store;
  }

  /**
   * Инициализация всех хранилищ
   */
  async initialize(): Promise<void> {
    // Инициализируем все хранилища параллельно
    await Promise.all(this.stores.map(store => store.initialize()));
    
    // Регистрируем shutdown hooks один раз для всех
    if (!this.hooksRegistered) {
      this.setupShutdownHooks();
      this.hooksRegistered = true;
    }
  }

  /**
   * Сохранение всех хранилищ
   */
  async saveAll(): Promise<void> {
    const saves = this.stores.map(store => store.saveToFile());
    await Promise.all(saves);
  }

  /**
   * Настройка хуков для сохранения при завершении
   */
  private setupShutdownHooks(): void {
    // Сохранение при нормальном завершении
    process.on('SIGINT', async () => {
      console.log('\n🛑 Получен сигнал завершения (SIGINT)...');
      await this.saveAll();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Получен сигнал завершения (SIGTERM)...');
      await this.saveAll();
      process.exit(0);
    });

    // Сохранение при необработанной ошибке
    process.on('uncaughtException', async (error) => {
      console.error('💥 Необработанная ошибка:', error);
      await this.saveAll();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      console.error('💥 Необработанное отклонение промиса:', reason);
      await this.saveAll();
      process.exit(1);
    });
  }

  /**
   * Получить количество зарегистрированных хранилищ
   */
  get count(): number {
    return this.stores.length;
  }
}
