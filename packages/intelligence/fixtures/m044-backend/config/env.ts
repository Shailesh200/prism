import Stripe from "stripe";

export const DATABASE_URL = process.env.DATABASE_URL;
export const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
export const stripe = new Stripe(STRIPE_KEY ?? "");
