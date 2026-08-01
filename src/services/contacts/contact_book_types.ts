export interface SaveContactInput {
  phone_number: string
  full_name: string
  first_name?: string
  user_id?: string
  username?: string
}

export interface SavedContact {
  phone_number: string
  full_name: string
  first_name: string
  user_id: string
  username?: string
}

export interface SaveContactResponse {
  success: true
  contact: SavedContact
}
