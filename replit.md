# Replit Development Guide

## Overview

This is a full-stack feedback collection application built with React frontend and Express backend. The application allows users to submit feedback about companies with optional file attachments (images/videos). It features a modern UI using shadcn/ui components with a purple-themed design inspired by the "Filazero" brand.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **UI Library**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: React Hook Form for form handling, TanStack Query for server state
- **Build Tool**: Vite with custom configuration for development and production

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with ESM modules
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **File Handling**: Multer for multipart form uploads
- **Session Management**: PostgreSQL session store

### Key Components

#### Database Schema (`shared/schema.ts`)
- **Users Table**: Basic user authentication with username/password
- **Feedbacks Table**: Stores feedback submissions with company name, description, impact level, feedback type, and optional file attachments
- **Validation**: Zod schemas for runtime validation

#### Frontend Components
- **FeedbackForm**: Main form component with drag-and-drop file upload
- **UI Components**: Complete shadcn/ui component library for consistent design
- **Responsive Design**: Mobile-first approach with Tailwind utilities

#### Backend Services
- **Storage Layer**: Memory storage implementation with interface for easy database swapping
- **File Upload**: Configured for images and videos up to 10MB
- **API Routes**: RESTful endpoints for feedback submission

### Data Flow

1. **Form Submission**: User fills feedback form with optional file upload
2. **Client Validation**: React Hook Form with Zod schema validation
3. **File Processing**: Multer handles file upload to local storage
4. **API Request**: Form data sent to Express backend via fetch
5. **Server Validation**: Backend validates data using shared Zod schemas
6. **Data Persistence**: Feedback stored in PostgreSQL via Drizzle ORM
7. **Response Handling**: Success/error feedback displayed via toast notifications

### External Dependencies

#### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL client
- **drizzle-orm**: Type-safe ORM for database operations
- **@tanstack/react-query**: Server state management
- **react-hook-form**: Form handling and validation
- **@hookform/resolvers**: Zod integration for form validation
- **multer**: File upload middleware

#### UI Dependencies
- **@radix-ui/***: Headless UI primitives
- **tailwindcss**: Utility-first CSS framework
- **lucide-react**: Icon library
- **class-variance-authority**: Component variant management
- **clsx**: Conditional CSS class utility

### Deployment Strategy

#### Development
- **Dev Server**: Vite dev server for frontend with HMR
- **Backend**: tsx for TypeScript execution with file watching
- **Database**: Drizzle migrations for schema management

#### Production Build
- **Frontend**: Vite builds optimized static assets
- **Backend**: esbuild bundles server code to ESM format
- **Database**: Requires DATABASE_URL environment variable
- **File Storage**: Local filesystem (uploads directory)

#### Environment Configuration
- **NODE_ENV**: Controls development vs production behavior
- **DATABASE_URL**: PostgreSQL connection string (required)
- **Replit Integration**: Special handling for Replit development environment

#### Key Architectural Decisions

**Database Choice**: PostgreSQL with Drizzle ORM chosen for type safety and serverless compatibility with Neon Database.

**Frontend Framework**: React with TypeScript for component reusability and type safety, combined with shadcn/ui for rapid UI development.

**State Management**: TanStack Query for server state to handle caching and synchronization, React Hook Form for complex form handling.

**File Upload Strategy**: Local filesystem storage with Multer, designed to be easily replaceable with cloud storage solutions.

**Styling Approach**: Tailwind CSS with CSS custom properties for theming, allowing easy brand customization while maintaining design consistency.

**Validation Strategy**: Shared Zod schemas between frontend and backend ensure consistent validation rules and reduce code duplication.

#### Recent Changes (January 30, 2025)

**Enhanced User Experience with Category Selection Modal**
- Added initial modal for feedback type selection (Bug vs Sugestão)
- Implemented dynamic form questions based on selected category
- Bug reports focus on problem description and severity
- Suggestions focus on improvement ideas and impact
- Category selection auto-fills feedback type field
- Users can change category selection during form completion