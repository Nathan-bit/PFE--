'use strict';

require('dotenv').config();

// Validate environment variables before starting
const { validateEnv } = require('./config/env-validator');
validateEnv();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const session = require('express-session');
const { RedisStore } = require('connect-redis');
const Redis = require('ioredis');

const connectionRoutes = require('./routes/connectionRoutes');
const uploadsRoutes = require('./routes/uploadsRoutes');
const databaseRoutes = require('./routes/databaseRoutes');
const UserProfilesRoutes = require('./routes/UserProfilesRoutes');
const entrepriseRoutes = require('./routes/entrepriseRoutes');
const etudiantsRoutes = require('./routes/etudiantsRoutes');
const encadrementRoutes = require('./routes/encadrementRoutes');
const planificationRoutes = require('./routes/planificationRoutes');

const authenticate = require('./middlewares/auth');
const checkRole = require('./middlewares/roles');
const logger = require('./logs/logger');
const requestLogger = require('./middlewares/request-logger');
const { RATE_LIMITS, PAGINATION } = require('./config/constants');

const { fetchSidebarItems, connectToDatabase } = require('./model/dbConfig');
const { sequelize } = require('./config/database');
const stage = require('./model/stagesModel');
const { syncStageModel } = require('./model/stagesModel');
const { syncSoutenanceModel } = require('./model/soutenanceModel');
const { syncPostulationModels } = require('./model/stagePostulationModel');
const { syncUserModel } = require('./model/userModel');
const { syncModel } = require('./model/model');
const { Op } = require('sequelize');

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:  ["'self'"],
            scriptSrc:   ["'self'", "'unsafe-inline'",
                          "https://cdn.jsdelivr.net",
                          "https://code.jquery.com",
                          "https://cdnjs.cloudflare.com"],
            styleSrc:    ["'self'", "'unsafe-inline'",
                          "https://cdn.jsdelivr.net",
                          "https://fonts.googleapis.com",
                          "https://cdnjs.cloudflare.com"],
            fontSrc:     ["'self'", "https:", "data:",
                          "https://fonts.gstatic.com",
                          "https://cdnjs.cloudflare.com"],
            imgSrc:      ["'self'", "data:", "https://ui-avatars.com"],
            connectSrc:  ["'self'"],
            frameSrc:    ["'none'"],
            objectSrc:   ["'none'"],
        },
    },
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
}));

// ── Rate limiters ─────────────────────────────────────────────────────────────
const connectionLimiter = rateLimit({
    windowMs: RATE_LIMITS.CONNECTION.WINDOW_MS,
    max: RATE_LIMITS.CONNECTION.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later.',
});

const searchLimiter = rateLimit({
    windowMs: RATE_LIMITS.SEARCH.WINDOW_MS,
    max: RATE_LIMITS.SEARCH.MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many search requests from this IP, please try again later.',
});

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(requestLogger()); // Log all HTTP requests
app.use(cookieParser());
app.use(flash());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/stockages', express.static(path.join(__dirname, 'stockages')));

const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    lazyConnect: true,
});
redisClient.on('error', err => logger.warn('Redis unavailable, falling back to memory store:', err.message));

app.use(session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.secretKey,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 86400000 },
}));

app.use((req, res, next) => {
    res.locals.messages = req.flash();
    next();
});

// ── Static files (public/ only) ───────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── View engine ───────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/connection', connectionLimiter, connectionRoutes);
app.use('/etudiant', authenticate, checkRole(['USER', 'ENTREPRISE', 'ADMIN', 'DEPARTEMENT']), etudiantsRoutes);
app.use('/entreprise', authenticate, checkRole(['ENTREPRISE', 'DEPARTEMENT', 'ADMIN']), entrepriseRoutes);
app.use('/encadrement', authenticate, checkRole(['DEPARTEMENT', 'ADMIN']), encadrementRoutes);
app.use('/planification', authenticate, checkRole(['DEPARTEMENT', 'ADMIN']), planificationRoutes);
app.use('/settings', authenticate, checkRole(['USER', 'ENTREPRISE', 'DEPARTEMENT', 'ADMIN']), UserProfilesRoutes);
app.use('/gestion', authenticate, checkRole(['ADMIN']), databaseRoutes);
app.use('/files', authenticate, checkRole(['ADMIN']), uploadsRoutes);

app.post('/sidebar', authenticate, async (req, res, next) => {
    try {
        const lang = (req.body && req.body.lang) || 'fr';
        const userRole = req.role;
        const sidebarItems = await fetchSidebarItems(lang, userRole);
        res.json(sidebarItems);
    } catch (error) {
        next(error);
    }
});

app.get(['/', '/home'], authenticate, async (req, res, next) => {
    try {
        const stages = await stage.findAll({
            order: [['created_at', 'DESC']]
        }) || [];
        res.render('pages/home', { stages: stages.map(s => s.toJSON()) });
    } catch (error) {
        next(error);
    }
});

app.get('/about', (req, res) => {
    res.render('pages/about');
});

app.get('/api/stages', authenticate, async (req, res, next) => {
    try {
        const stages = await stage.findAll({
            order: [['created_at', 'DESC']]
        }) || [];
        res.json(stages.map(s => s.toJSON()));
    } catch (error) {
        next(error);
    }
});

app.get('/check-token', authenticate, (req, res) => {
    res.status(200).json({ valid: true });
});

// ── Search ────────────────────────────────────────────────────────────────────
app.get('/search', authenticate, searchLimiter, async (req, res, next) => {
    const query = req.query.q;
    if (!query || !query.trim()) {
        return res.redirect('/home');
    }

    const page = parseInt(req.query.page, 10) || 1;
    const ITEMS_PER_PAGE = 10;
    const terms = query.split(' ').map(t => t.trim()).filter(Boolean);

    try {
        const { count, rows } = await stage.findAndCountAll({
            where: {
                [Op.or]: terms.flatMap(term => [
                    { titre:          { [Op.like]: `%${term}%` } },
                    { domaine:        { [Op.like]: `%${term}%` } },
                    { niveau:         { [Op.like]: `%${term}%` } },
                    { langue:         { [Op.like]: `%${term}%` } },
                    { adresse:        { [Op.like]: `%${term}%` } },
                    { ville:          { [Op.like]: `%${term}%` } },
                    { nom_entreprise: { [Op.like]: `%${term}%` } },
                    { libelle:        { [Op.like]: `%${term}%` } },
                ])
            },
            limit: ITEMS_PER_PAGE,
            offset: (page - 1) * ITEMS_PER_PAGE,
            order: [['created_at', 'DESC']],
        });

        const totalPages = Math.ceil(count / ITEMS_PER_PAGE);
        // Call toJSON() so uppercase aliases (Domaine, Libelle, Address, Nom, Description) are available in the template
        const jobs = rows.map(r => r.toJSON());

        res.render('pages/search-results', {
            jobs,
            query,
            length: count,
            currentPage: page,
            totalPages,
        });
    } catch (error) {
        next(error);
    }
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).render('pages/404', { error: req.originalUrl });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    logger.error(err.stack || err.message);
    res.status(500).render('pages/404', { error: 'Internal server error' });
});

// ── Startup ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
let server;

// Error codes that indicate the table already has the correct schema.
// These occur when the DB volume was created by a previous run and the
// Sequelize alter tries to add columns / keys that already exist.
const SYNC_IGNORABLE_CODES = new Set([
  'ER_DUP_FIELDNAME',          // duplicate column name
  'ER_DUP_KEYNAME',            // duplicate key name
  'ER_MULTIPLE_PRI_KEY',       // multiple primary key defined
  'ER_TRUNCATED_WRONG_VALUE',  // bad existing data blocks ALTER (e.g. 0000-00-00 dates)
  'ER_CANT_DROP_FIELD_OR_KEY', // trying to drop a key that doesn't exist
  'ER_DUP_ENTRY',              // duplicate entry on unique constraint
]);

async function syncAllModels() {
  const steps = [
    ['syncModel (legacy tables)',   syncModel],
    ['syncStageModel',              syncStageModel],
    ['syncSoutenanceModel',         syncSoutenanceModel],
    ['syncPostulationModels',       syncPostulationModels],
    ['syncUserModel',               syncUserModel],
  ];
  for (const [label, fn] of steps) {
    try {
      await fn();
    } catch (error) {
      if (error.original && SYNC_IGNORABLE_CODES.has(error.original.code)) {
        logger.warn(`[syncAllModels] ${label}: skipping alter — ${error.original.sqlMessage}`);
      } else {
        throw error;
      }
    }
  }
}

const startServer = async () => {
    try {
        await connectToDatabase();
        await syncAllModels();
        server = app.listen(PORT, () => {
            logger.info(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully.`);
    if (server) {
        server.close(async () => {
            try {
                await sequelize.close();
                logger.info('Database connection closed.');
            } catch (err) {
                logger.error('Error closing database connection:', err);
            }
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ── Process-level error handlers ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
});
