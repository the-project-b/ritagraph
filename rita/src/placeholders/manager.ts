import { PlaceholderResolver, PlaceholderRegistry, PlaceholderContext } from "./types";

export class PlaceholderManager {
  private registry: PlaceholderRegistry = {};

  /**
   * Register a placeholder resolver
   */
  register(resolver: PlaceholderResolver): void {
    this.registry[resolver.name] = resolver;
  }

  /**
   * Parse a prompt template to find placeholders
   * Supports both f-string format {placeholder} and mustache format {{placeholder}}
   */
  findPlaceholders(promptTemplate: string): string[] {
    const placeholders = new Set<string>();
    
    // Find mustache placeholders first: {{placeholder}}
    const mustacheMatches = promptTemplate.match(/\{\{([^}]+)\}\}/g);
    if (mustacheMatches) {
      mustacheMatches.forEach(match => {
        const placeholder = match.slice(2, -2).trim();
        placeholders.add(placeholder);
      });
    }

    // Remove mustache placeholders from template before finding f-string ones
    let templateWithoutMustache = promptTemplate;
    if (mustacheMatches) {
      mustacheMatches.forEach(match => {
        templateWithoutMustache = templateWithoutMustache.replace(match, '');
      });
    }

    // Find f-string placeholders: {placeholder}
    const fStringMatches = templateWithoutMustache.match(/\{([^}]+)\}/g);
    if (fStringMatches) {
      fStringMatches.forEach(match => {
        const placeholder = match.slice(1, -1).trim();
        placeholders.add(placeholder);
      });
    }

    return Array.from(placeholders);
  }

  /**
   * Build the invoke object with resolved placeholder values
   */
  async buildInvokeObject(
    promptTemplate: string,
    context: PlaceholderContext,
    baseObject: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const placeholders = this.findPlaceholders(promptTemplate);
    const invokeObject = { ...baseObject };

    for (const placeholderName of placeholders) {
      const resolver = this.registry[placeholderName];
      if (resolver) {
        try {
          const value = await resolver.resolve(context);
          invokeObject[placeholderName] = value;
        } catch (error) {
          console.warn(`Failed to resolve placeholder '${placeholderName}':`, error);
          // Keep the placeholder unresolved rather than breaking
        }
      }
      // If no resolver is found, the placeholder will remain unresolved
      // This allows for manual placeholders like 'question' to still work
    }

    return invokeObject;
  }

  /**
   * Build invoke object ensuring all required variables are included
   * This version takes a list of required input variables and ensures they're all present
   */
  async buildInvokeObjectWithRequiredVars(
    promptTemplate: string,
    context: PlaceholderContext,
    requiredVars: string[] = [],
    baseObject: Record<string, any> = {}
  ): Promise<Record<string, any>> {
    const invokeObject = await this.buildInvokeObject(promptTemplate, context, baseObject);
    
    // Ensure all required variables are present
    for (const varName of requiredVars) {
      if (!(varName in invokeObject)) {
        const resolver = this.registry[varName];
        if (resolver) {
          try {
            const value = await resolver.resolve(context);
            invokeObject[varName] = value;
          } catch (error) {
            console.warn(`Failed to resolve required variable '${varName}':`, error);
            // Set a default value to prevent errors
            invokeObject[varName] = `[${varName}]`;
          }
        } else {
          console.warn(`No resolver found for required variable '${varName}', using placeholder`);
          invokeObject[varName] = `[${varName}]`;
        }
      }
    }

    return invokeObject;
  }

  /**
   * Get all registered placeholder names
   */
  getRegisteredPlaceholders(): string[] {
    return Object.keys(this.registry);
  }
}

// Export a singleton instance
export const placeholderManager = new PlaceholderManager(); 