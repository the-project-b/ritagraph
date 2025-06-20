import { PlaceholderResolver, PlaceholderContext } from "./types";

export const timestampResolver: PlaceholderResolver = {
  name: "current_timestamp",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return new Date().toISOString();
  }
};

export const dateResolver: PlaceholderResolver = {
  name: "current_date",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return new Date().toLocaleDateString();
  }
};

export const timeResolver: PlaceholderResolver = {
  name: "current_time",
  resolve: async (context: PlaceholderContext): Promise<string> => {
    return new Date().toLocaleTimeString();
  }
}; 