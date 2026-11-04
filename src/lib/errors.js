import { GraphQLError } from 'graphql';

export const gqlError = (message, code) => new GraphQLError(message, { extensions: { code } });

/** 丟出使用者輸入錯誤 */
export const fail = (message) => {
  throw gqlError(message, 'BAD_USER_INPUT');
};
