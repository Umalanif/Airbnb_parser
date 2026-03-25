#!/bin/sh

# Apply Prisma migrations to sync database schema
npx prisma db push

# Seed the database with initial data
npx prisma db seed

# Start the main application
npm start
