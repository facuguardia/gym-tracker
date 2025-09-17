-- Añadir campo weight a la tabla exercises
ALTER TABLE exercises ADD COLUMN weight DECIMAL(10, 2) DEFAULT 0;