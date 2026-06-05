export const API_BASE =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const API_V2_BASE = API_BASE.replace('/v1', '/v2');
