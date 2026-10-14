export interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  enabled: boolean;
  roles: string[];
  createdAt?: string;
}