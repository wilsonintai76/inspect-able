import { Hono } from 'hono';
import { Bindings, Variables } from '../types';
import { addTestAuthRoute } from './db.shared';
import { router as auditRoutes } from './db.audits';
import { router as userRoutes } from './db.users';
import { router as departmentRoutes } from './db.departments';
import { router as locationRoutes } from './db.locations';
import { router as mappingRoutes } from './db.mappings';
import { router as settingsRoutes } from './db.settings';

const db = new Hono<{ Bindings: Bindings, Variables: Variables }>();

addTestAuthRoute(db);

db.route('/', auditRoutes);
db.route('/', userRoutes);
db.route('/', departmentRoutes);
db.route('/', locationRoutes);
db.route('/', mappingRoutes);
db.route('/', settingsRoutes);

export { db as dbRoutes };
