export interface Session {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface Guest {
  id: string;
  session_id: string;
  name: string;
  joined_at: string;
}

export interface Photo {
  id: string;
  session_id: string;
  guest_id: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  caption: string | null;
  created_at: string;
  guest?: Guest;
}
