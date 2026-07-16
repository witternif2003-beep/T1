/// <reference types="vite/client" />

import type { PublicKey, Transaction } from '@solana/web3.js';

interface SolanaWallet {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect: () => Promise<{ publicKey: PublicKey }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string } | string>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  on?: (event: string, callback: (publicKey: PublicKey | null) => void) => void;
  off?: (event: string, callback: (publicKey: PublicKey | null) => void) => void;
}

declare global {
  interface Window {
    solana?: SolanaWallet;
  }
}
