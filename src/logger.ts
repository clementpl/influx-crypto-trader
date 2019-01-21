import * as winston from 'winston';
import * as moment from 'moment';
import { config } from '../config/config';

// Path helper replace {time} => current time
const resolvePath = (path: string) => path.replace('{time}', moment().format('YYYYMMDD-HHmm'));

function format(colorize: boolean = false) {
  // Format helper
  const getTs = () => moment().format();
  const formatHandler = (info: any) =>
    `${getTs()} [${info.level}]: ${info.message}${info.stack ? '\n' + info.stack + '\n' : ''}`;

  // combine
  return colorize
    ? winston.format.combine(winston.format.colorize(), winston.format.printf(formatHandler))
    : winston.format.combine(winston.format.printf(formatHandler));
}

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.File(<any>{
      // format: format() //without colorize => winston bug => https://github.com/winstonjs/winston/issues/1243
      filename: resolvePath(config.log.logPath),
    }),
    new winston.transports.File({
      // format: format() //without colorize => winston bug => https://github.com/winstonjs/winston/issues/1243
      level: 'error',
      filename: resolvePath(config.log.errorPath),
    }),
  ],
  format: format(true),
  exitOnError: false, // do not exit on handled exceptions
});

// Call exceptions.handle with a transport to handle exceptions
logger.exceptions.handle(
  new winston.transports.File({
    format: format(),
    filename: resolvePath(config.log.errorPath),
  })
);
