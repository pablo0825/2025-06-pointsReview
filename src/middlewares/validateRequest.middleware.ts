import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

export interface RequestSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

export function validateRequest<TSchemas extends RequestSchemas>(
  schemas: TSchemas,
): RequestHandler {
  return (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params);
    }

    if (schemas.query) {
      const query = schemas.query.parse(req.query);

      // Express 5 exposes req.query through a prototype getter without a setter.
      Object.defineProperty(req, "query", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: query,
      });
    }

    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }

    next();
  };
}
