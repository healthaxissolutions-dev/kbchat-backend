// src/services/supabase.ts
// Handles vector similarity search via Supabase

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
    if (!client) {
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_KEY;

        if (!url || !key) {
            throw new Error("SUPABASE_URL and SUPABASE_KEY must be set.");
        }

        client = createClient(url, key);
        console.log("✅ Supabase client initialized.");
    }
    return client;
}

export interface DocumentChunk {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    similarity?: number;
}

/**
 * Search for document chunks similar to the given embedding.
 * RPC: match_mxbai_chunks(query_embedding, match_count, match_threshold)
 * Service/metadata filtering is not supported by the current RPC — implement
 * a filtered variant in Supabase and add a parameter here when ready.
 */
export async function searchDocuments(
    embedding: number[],
    matchCount: number = 5,
    matchThreshold: number = 0.3
): Promise<DocumentChunk[]> {
    const supabase = getClient();

    const { data, error } = await supabase.rpc("match_mxbai_chunks", {
        query_embedding: embedding,
        match_count: matchCount,
        match_threshold: matchThreshold,
    });

    if (error) {
        console.error("❌ Supabase search error:", error);
        throw new Error(`Supabase RPC error: ${error.message}`);
    }

    return (data as DocumentChunk[]) || [];
}
