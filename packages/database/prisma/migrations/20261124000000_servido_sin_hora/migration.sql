-- B6-13 (M-35): un plato marcado servido al pedir la cuenta («¿Ya se sirvió todo?» → «Sí, todo servido») no se sabe a
-- qué hora llegó a la mesa: queda servido, sin hora exacta, y la atención en el salón no lo mide como espera. Solo
-- expande (ADR-028): la versión anterior no lee la columna y lo ve servido a la hora en que se marcó.
ALTER TABLE kitchen_order_line_served ADD COLUMN sin_hora BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kitchen_order_line_served ADD CONSTRAINT kitchen_order_line_served_sin_hora CHECK (NOT sin_hora OR kind = 'SERVIDO');
