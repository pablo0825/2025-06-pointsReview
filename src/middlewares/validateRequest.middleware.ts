import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";

export interface RequestSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

type ParsedValue<TSchema extends ZodTypeAny | undefined> =
  TSchema extends ZodTypeAny ? z.infer<TSchema> : unknown;

export function validateRequest<TSchemas extends RequestSchemas>(
  schemas: TSchemas,
): RequestHandler<
  ParsedValue<TSchemas["params"]>,
  unknown,
  ParsedValue<TSchemas["body"]>,
  ParsedValue<TSchemas["query"]>
> {
  return (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params);
    }

    if (schemas.query) {
      req.query = schemas.query.parse(req.query);
    }

    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }

    next();
  };
}
