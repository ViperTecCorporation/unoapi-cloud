export type ContactDirectoryQuery = {
  cursor?: string
  limit?: number
  search?: string
}

export type ContactDirectoryItem = {
  user_id: string
  phone_number?: string
  display_name?: string
  push_name?: string
  username?: string
  picture?: string
  last_updated_ms: number
}

export type ContactDirectoryPage = {
  contacts: ContactDirectoryItem[]
  next_cursor: string
  has_more: boolean
  total_count: number
  raw_total_count: number
  ignored_count: number
}

export interface ContactDirectory {
  list(phone: string, query?: ContactDirectoryQuery): Promise<ContactDirectoryPage>
}
