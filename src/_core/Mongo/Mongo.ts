import * as mongoose from 'mongoose';
import { logger } from '../../logger';

export interface MongoConfig {
  host: string;
  port: number;
  database: string;
}

export class Mongo {
  public static URL: string;

  public static async connect(conf: MongoConfig) {
    // Set mongo url
    Mongo.URL = `mongodb://${conf.host}:${conf.port}/${conf.database}`;
    // connect
    try {
      await mongoose.connect(
        Mongo.URL,
        { useNewUrlParser: true }
      );
      logger.info(`[MONGODB] Connection successful: ${Mongo.URL}`);
    } catch (error) {
      logger.error(new Error(`[MONGODB] Connection error: ${Mongo.URL}`));
      throw error;
    }
  }

  public static async close() {
    try {
      await mongoose.connection.close();
    } catch (error) {
      logger.error(new Error(`[MONGODB] Close connection error: ${Mongo.URL}`));
      throw error;
    }
  }
}
