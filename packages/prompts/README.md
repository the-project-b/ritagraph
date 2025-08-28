# Directory Structure

This package follows Domain Driven Design (DDD) principles. Here's what each directory contains and why:

## `src/domain/`
**Pure business logic with zero dependencies.** This is the heart of your package.

### `entities/`
Core business objects with identity and lifecycle.
```typescript
// user.entity.ts
class User {
  constructor(private id: UserId, private email: Email) {}
  changeEmail(newEmail: Email): void { /* business rules */ }
}
```

### `value-objects/`
Immutable objects that represent concepts without identity.
```typescript
// email.value-object.ts
class Email {
  constructor(private value: string) {
    if (!this.isValid(value)) throw new Error('Invalid email');
  }
}
```

### `aggregates/`
Groups of entities that change together as a single unit.
```typescript
// order.aggregate.ts
class Order {
  constructor(private items: OrderItem[], private customer: Customer) {}
  addItem(item: OrderItem): void { /* ensures consistency */ }
}
```

### `repositories/`
Interfaces for data access (no implementations).
```typescript
// user.repository.ts
interface UserRepository {
  save(user: User): Promise<void>;
  findById(id: UserId): Promise<User | null>;
}
```

### `services/`
Business logic that doesn't naturally fit in entities.
```typescript
// pricing.service.ts
class PricingService {
  calculateDiscount(customer: Customer, order: Order): Money { }
}
```

### `events/`
Domain events that represent business-significant occurrences.
```typescript
// user-registered.event.ts
class UserRegisteredEvent {
  constructor(public userId: UserId, public occurredAt: Date) {}
}
```

## `src/application/`
**Orchestrates domain objects to fulfill use cases.** Contains your package's main workflows.

### `use-cases/`
Complete business workflows that your package provides.
```typescript
// register-user.use-case.ts
class RegisterUserUseCase {
  execute(command: RegisterUserCommand): Promise<void> {
    // Orchestrate domain objects
  }
}
```

### `services/`
Application-specific logic and coordination.
```typescript
// notification.service.ts
class NotificationService {
  notifyUserRegistered(user: User): Promise<void> { }
}
```

### `dto/`
Data Transfer Objects for input/output.
```typescript
// register-user.dto.ts
interface RegisterUserCommand {
  email: string;
  firstName: string;
  lastName: string;
}
```

## `src/infrastructure/`
**External dependencies and technical implementations.** Everything that touches the outside world.

### `repositories/`
Concrete implementations of domain repository interfaces.
```typescript
// in-memory-user.repository.ts
class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, User>();
  // Implementation details
}
```

### `adapters/`
Adapters for external services and APIs.
```typescript
// email.adapter.ts
class SendGridEmailAdapter implements EmailService {
  send(email: Email): Promise<void> { /* SendGrid API call */ }
}
```

### `factories/`
Complex object creation logic.
```typescript
// user.factory.ts
class UserFactory {
  createFromRegistration(command: RegisterUserCommand): User {
    // Complex creation logic
  }
}
```

## `src/shared/`
**Cross-cutting concerns used throughout the package.**

### `errors/`
Custom error types for your domain.
```typescript
// domain.errors.ts
export class ValidationError extends Error {}
export class NotFoundError extends Error {}
```

### `types/`
Shared TypeScript types and interfaces.
```typescript
// common.types.ts
export type ID = string;
export interface Timestamp {
  createdAt: Date;
  updatedAt: Date;
}
```

### `utils/`
Pure utility functions with no business logic.
```typescript
// validation.utils.ts
export const isValidEmail = (email: string): boolean => { }
```

### `constants/`
Domain constants and configuration values.
```typescript
// user.constants.ts
export const MAX_LOGIN_ATTEMPTS = 3;
export const PASSWORD_MIN_LENGTH = 8;
```

## `src/index.ts`
**Your package's public API.** Only export what other packages should use.
```typescript
// Clean, domain-focused exports
export { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
export type { RegisterUserCommand } from './application/dto/register-user.dto';
export { ValidationError } from './shared/errors/domain.errors';
```

## Key Principles
- **Dependencies flow inward**: Domain never imports from application/infrastructure
- **Interfaces over implementations**: Domain defines contracts, infrastructure implements them
- **Single responsibility**: Each file has one clear purpose
- **Public API**: Only export through `index.ts` what consuming packages need