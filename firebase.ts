export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  images?: string[];
  category: string;
  phone?: string;
  location?: string;
  sellerName?: string;
  sellerId?: string;
  rating?: number;
  inStock?: boolean;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Chat {
  id: string;
  participants: string[];
  productId: string;
  productName: string;
  buyerId: string;
  sellerId: string;
  lastMessage?: string;
  updatedAt: any;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
