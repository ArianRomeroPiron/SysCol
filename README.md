# SysCol

# ES
# 🏪 Sistema para Colmados

> Un sistema moderno de gestión para colmados dominicanos — que reemplaza las cuentas en papel con inventario, ventas y avisos automáticos de deudas ("fiao") por WhatsApp.

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Angular](https://img.shields.io/badge/Angular-latest-DD0031?logo=angular&logoColor=white)](https://angular.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-listo-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

---

## 📖 Sobre el proyecto

Muchos colmados todavía llevan las ventas, el inventario y las deudas de los clientes ("fiao") en papel. Esto significa registros perdidos, ninguna visibilidad sobre quién debe y cuánto, y ninguna forma fácil de darle seguimiento a los clientes.

**Sistema para Colmados** es una plataforma SaaS ligera y accesible que digitaliza ese flujo de trabajo diario — pensada para ser lo suficientemente simple como para que el colmadero la use directo desde el celular, sin curva de aprendizaje.

### Funciones principales

| Módulo | Descripción |
|---|---|
| 📦 **Inventario** | Control de productos, categorías, niveles de stock y alertas de bajo inventario |
| 🧾 **Ventas (Punto de Venta)** | Flujo rápido de venta con carrito, totales y métodos de pago |
| 💳 **Fiao (Crédito)** | Historial de deudas, abonos parciales y límites de crédito por cliente |
| 📲 **Avisos por WhatsApp** | Mensajes automáticos de recordatorio de deuda a los clientes |
| 📊 **Reportes** | Ventas por período, productos más vendidos, resumen de deudas pendientes |
| 🔐 **Autenticación** | Inicio de sesión con JWT y control de acceso por roles |

---

## 🛠️ Stack tecnológico

**Backend**
- Python + FastAPI
- SQLAlchemy + Alembic (migraciones)
- PostgreSQL
- Autenticación JWT

**Frontend**
- Angular + Angular Material / PrimeNG

**Integraciones**
- Twilio API / WhatsApp Business Cloud API

**Infraestructura**
- Docker & Docker Compose
- GitHub Actions (CI/CD)

---

## 📂 Estructura del proyecto

```
sistema-colmados/
├── backend/
│   ├── app/
│   │   ├── core/          # configuración, base de datos, seguridad
│   │   ├── models/         # modelos de SQLAlchemy
│   │   ├── schemas/        # schemas de Pydantic
│   │   ├── routers/        # endpoints de la API por módulo
│   │   └── services/       # lógica de negocio
│   ├── alembic/            # migraciones de base de datos
│   └── Dockerfile
├── frontend/
│   └── src/app/
│       ├── inventario/      # Módulo de inventario
│       ├── ventas/          # Módulo de ventas
│       ├── fiao/            # Módulo de crédito / deudas
│       └── reportes/        # Módulo de reportes
├── docs/
│   └── modelo-datos.dbml    # esquema de la base de datos (DBML)
└── docker-compose.yml
```

---

## 🚀 Cómo empezar

### Requisitos previos
- Docker & Docker Compose
- Node.js + Angular CLI (para desarrollo del frontend)

### Instalación

```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/sistema-colmados.git
cd sistema-colmados

# 2. Configurar variables de entorno
cp backend/.env.example backend/.env
# edita backend/.env con tu propio SECRET_KEY y credenciales de WhatsApp

# 3. Levantar el backend + base de datos
docker compose up --build
```

La API estará disponible en `http://localhost:8000`, con documentación interactiva en `http://localhost:8000/docs`.

```bash
# 4. Correr las migraciones de la base de datos
docker compose exec backend alembic upgrade head

# 5. Levantar el frontend (en otra terminal)
cd frontend
npm install
ng serve
```

La app estará disponible en `http://localhost:4200`.

---

## 👥 Equipo y responsabilidad por módulo

| Persona | Módulo |
|---|---|
| P1 | Inventario y Productos |
| P2 | Ventas y Punto de Venta |
| P3 | Fiao (Crédito) + WhatsApp |
| P4 | Reportes + Infraestructura / Líder Técnico |

---

## 🌱 Hoja de ruta

- [x] Configuración del proyecto y entorno Docker
- [x] Autenticación JWT
- [ ] CRUD de inventario
- [ ] Flujo de punto de venta
- [ ] Fiao y avisos por WhatsApp
- [ ] Dashboard de reportes

---

## 📄 Licencia

Este proyecto es de uso académico / personal. Licencia por definir.

# EN
# 🏪 Sistema para Colmados

> A modern management system for neighborhood corner stores ("colmados") in the Dominican Republic — replacing pen-and-paper bookkeeping with inventory tracking, sales, and automated credit ("fiao") reminders.

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Angular](https://img.shields.io/badge/Angular-latest-DD0031?logo=angular&logoColor=white)](https://angular.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

---

## 📖 About the project

Many *colmados* still track sales, stock, and customer debt ("fiao") on paper. This means lost records, no visibility into who owes what, and no easy way to follow up with customers.

**Sistema para Colmados** is a lightweight, affordable SaaS platform that brings this daily workflow online — designed to be simple enough for an owner to use straight from their phone, with no learning curve.

### Core features

| Module | Description |
|---|---|
| 📦 **Inventory** | Track products, categories, stock levels, and low-stock alerts |
| 🧾 **Sales (POS)** | Fast point-of-sale flow with cart, totals, and payment methods |
| 💳 **Fiao (Credit)** | Track customer debt, partial payments (abonos), and credit limits |
| 📲 **WhatsApp reminders** | Automatic debt-reminder messages sent to customers |
| 📊 **Reports** | Sales by period, best-selling products, outstanding debt overview |
| 🔐 **Authentication** | JWT-based login with role-based access |

---

## 🛠️ Tech stack

**Backend**
- Python + FastAPI
- SQLAlchemy + Alembic (migrations)
- PostgreSQL
- JWT authentication

**Frontend**
- Angular + Angular Material / PrimeNG

**Integrations**
- Twilio API / WhatsApp Business Cloud API

**Infrastructure**
- Docker & Docker Compose
- GitHub Actions (CI/CD)

---

## 📂 Project structure

```
sistema-colmados/
├── backend/
│   ├── app/
│   │   ├── core/          # config, database, security
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── routers/        # API endpoints per module
│   │   └── services/       # business logic
│   ├── alembic/            # database migrations
│   └── Dockerfile
├── frontend/
│   └── src/app/
│       ├── inventario/      # Inventory module
│       ├── ventas/          # Sales module
│       ├── fiao/            # Credit / debt module
│       └── reportes/        # Reports module
├── docs/
│   └── modelo-datos.dbml    # database schema (DBML)
└── docker-compose.yml
```

---

## 🚀 Getting started

### Prerequisites
- Docker & Docker Compose
- Node.js + Angular CLI (for frontend development)

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/sistema-colmados.git
cd sistema-colmados

# 2. Configure environment variables
cp backend/.env.example backend/.env
# edit backend/.env with your own SECRET_KEY and WhatsApp credentials

# 3. Start the backend + database
docker compose up --build
```

The API will be available at `http://localhost:8000`, with interactive docs at `http://localhost:8000/docs`.

```bash
# 4. Run database migrations
docker compose exec backend alembic upgrade head

# 5. Start the frontend (in a separate terminal)
cd frontend
npm install
ng serve
```

The app will be available at `http://localhost:4200`.

---

## 👥 Team & module ownership

| Person | Module |
|---|---|
| P1 | Inventory & Products |
| P2 | Sales & Point of Sale |
| P3 | Fiao (Credit) + WhatsApp |
| P4 | Reports + Infrastructure / Tech Lead |

---

## 🌱 Roadmap

- [x] Project setup & Docker environment
- [x] JWT authentication
- [ ] Inventory CRUD
- [ ] Point of sale flow
- [ ] Fiao & WhatsApp reminders
- [ ] Reports dashboard

---

## 📄 License

This project is for academic / personal use. License to be defined.

