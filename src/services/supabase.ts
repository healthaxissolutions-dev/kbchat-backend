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
 * RPC signature: match_mxbai_chunks(match_count, match_threshold, query_embedding)
 * Note: metadata_filter is not supported by this function.
 */
export async function searchDocuments(
    embedding: number[],
    matchCount: number = 5,
    matchThreshold: number = 0.3,
    _metadataFilter: Record<string, any> = {}  // reserved for future use
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
