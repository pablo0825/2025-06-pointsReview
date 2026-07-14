import cors from "cors";
import cookieParser from "cookie-parser";
import express, { type Router } from "express";
import createError from "http-errors";
import helmet from "helmet";
import logger from "morgan";
import path from "path";

import authRoute from "./routes/auth.route";
import { errorHandler } from "./middlewares/errorHandler.middleware";

interface LegacyMongoRoutes {
  competitionFormRoute: Router;
  competitionFormAdminRoute: Router;
}

interface CreateAppOptions {
  legacyMongoRoutes?: LegacyMongoRoutes;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(logger("dev"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, "public")));

  if (options.legacyMongoRoutes) {
    app.use("/api/form/competition", options.legacyMongoRoutes.competitionFormRoute);
    app.use(
      "/api/admin/form/competition",
      options.legacyMongoRoutes.competitionFormAdminRoute,
    );
  }

  app.use("/auth", authRoute);

  app.use((_req, _res, next) => {
    next(createError(404, "找不到路由"));
  });

  app.use(errorHandler);

  return app;
}
