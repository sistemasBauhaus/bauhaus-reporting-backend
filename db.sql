-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS departamentos_depto_id_seq;

-- Table Definition
CREATE TABLE "public"."departamentos" (
    "depto_id" int4 NOT NULL DEFAULT nextval('departamentos_depto_id_seq'::regclass),
    "empresa_id" int4,
    "nombre" varchar(100) NOT NULL,
    CONSTRAINT "departamentos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("empresa_id"),
    PRIMARY KEY ("depto_id")
);

-- Table Definition
CREATE TABLE "public"."datos_metricas" (
    "fecha" timestamp NOT NULL,
    "empresa_id" int4 NOT NULL,
    "depto_id" int4 NOT NULL,
    "producto_id" int4 NOT NULL,
    "cantidad" numeric,
    "importe" numeric,
    "estacion_id" int4 NOT NULL,
    "caja_id" int4 NOT NULL,
    "nombre_estacion" text,
    "nombre_caja" text,
    "id_cierre_turno" int8 NOT NULL,
    PRIMARY KEY ("id_cierre_turno","producto_id")
);

-- Table Definition
CREATE TABLE "public"."cierres_turno" (
    "id_cierre_turno" int8 NOT NULL,
    "fecha" timestamp NOT NULL,
    "id_caja" int4 NOT NULL,
    "nombre_caja" text,
    "id_estacion" int4 NOT NULL,
    "nombre_estacion" text,
    "importe_total" numeric,
    "litros_total" numeric,
    "total_efectivo_recaudado" int8,
    "importe_ventas_totales_contado" int8,
    PRIMARY KEY ("id_cierre_turno")
);

-- Table Definition
CREATE TABLE "public"."usuario_empresa" (
    "user_id" int4 NOT NULL,
    "empresa_id" int4 NOT NULL,
    "rol_id" int4,
    CONSTRAINT "usuario_empresa_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("user_id"),
    CONSTRAINT "usuario_empresa_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("empresa_id"),
    CONSTRAINT "usuario_empresa_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("rol_id"),
    PRIMARY KEY ("user_id","empresa_id")
);


-- Indices
CREATE UNIQUE INDEX unique_usuario_empresa ON public.usuario_empresa USING btree (user_id, empresa_id);

-- Table Definition
CREATE TABLE "public"."logs_ingesta" (
    "fecha" timestamp DEFAULT now(),
    "registros_insertados" int4,
    "estado" varchar(50),
    "mensaje_error" text
);

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS roles_rol_id_seq;

-- Table Definition
CREATE TABLE "public"."roles" (
    "rol_id" int4 NOT NULL DEFAULT nextval('roles_rol_id_seq'::regclass),
    "nombre" varchar(50) NOT NULL,
    PRIMARY KEY ("rol_id")
);


-- Indices
CREATE UNIQUE INDEX roles_nombre_key ON public.roles USING btree (nombre);

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS usuarios_user_id_seq;

-- Table Definition
CREATE TABLE "public"."usuarios" (
    "user_id" int4 NOT NULL DEFAULT nextval('usuarios_user_id_seq'::regclass),
    "email" varchar(255) NOT NULL,
    "password_hash" varchar(255) NOT NULL,
    "rol_id" int4,
    "activo" bool DEFAULT true,
    "nombre_usuario" varchar(100),
    "dni" varchar(20),
    CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("rol_id"),
    PRIMARY KEY ("user_id")
);


-- Indices
CREATE UNIQUE INDEX usuarios_email_key ON public.usuarios USING btree (email);
CREATE UNIQUE INDEX unique_nombre_usuario ON public.usuarios USING btree (nombre_usuario);

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS empresas_empresa_id_seq;

-- Table Definition
CREATE TABLE "public"."empresas" (
    "empresa_id" int4 NOT NULL DEFAULT nextval('empresas_empresa_id_seq'::regclass),
    "nombre" varchar(100) NOT NULL,
    PRIMARY KEY ("empresa_id")
);


-- Indices
CREATE UNIQUE INDEX unique_empresa_nombre ON public.empresas USING btree (nombre);

-- Table Definition
CREATE TABLE "public"."dim_tiempo" (
    "fecha" date NOT NULL,
    "anio" int4,
    "mes" int4,
    "dia" int4,
    PRIMARY KEY ("fecha")
);

-- Table Definition
CREATE TABLE "public"."tokens_api" (
    "token" text,
    "fecha_expiracion" timestamp,
    "estado" varchar(50),
    "mensaje_error" text
);

-- Sequence and defined type
CREATE SEQUENCE IF NOT EXISTS cierres_medios_pago_id_seq;

-- Table Definition
CREATE TABLE "public"."cierres_medios_pago" (
    "id" int4 NOT NULL DEFAULT nextval('cierres_medios_pago_id_seq'::regclass),
    "id_cierre_turno" int4 NOT NULL,
    "medio_pago" varchar(100) NOT NULL,
    "importe" numeric(12,2) DEFAULT 0,
    PRIMARY KEY ("id")
);

-- Table Definition
CREATE TABLE "public"."usuario_depto" (
    "user_id" int4 NOT NULL,
    "depto_id" int4 NOT NULL,
    CONSTRAINT "usuario_depto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("user_id"),
    CONSTRAINT "usuario_depto_depto_id_fkey" FOREIGN KEY ("depto_id") REFERENCES "public"."departamentos"("depto_id"),
    PRIMARY KEY ("user_id","depto_id")
);

-- Table Definition
CREATE TABLE "public"."precios_articulos" (
    "producto_id" int4 NOT NULL,
    "nombre" text,
    "precio" numeric(18,2),
    "actualizado" timestamp DEFAULT now(),
    CONSTRAINT "precios_articulos_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."dim_producto"("producto_id"),
    PRIMARY KEY ("producto_id")
);

-- Table Definition
CREATE TABLE "public"."dim_producto" (
    "producto_id" int4 NOT NULL,
    "nombre" text NOT NULL,
    "origen" text DEFAULT 'Playa'::text,
    "categoria" text DEFAULT 'LIQUIDOS'::text,
    PRIMARY KEY ("producto_id")
);

