import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    heroImage: z.string(),
  }),
});

const notes = defineCollection({
  schema: z.object({
    title: z.string(),
    tags: z.array(z.string()).optional(),
    heroImage: z.string(),
  }),
});

export const collections = { blog, notes };
