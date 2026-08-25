-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('COMPUTER', 'PRINTER_MFU', 'SERVER', 'NETWORK_EQUIPMENT', 'VIRTUAL_SERVER', 'APPLICATION', 'MICROSERVICE', 'CAMERA', 'UPS', 'POWER_CLIMATE', 'OTHER');

-- CreateEnum
CREATE TYPE "branch" AS ENUM ('DIT', 'DRB', 'ODS', 'DKB', 'SERVICE_FACTORY', 'CORPORATE_UNIVERSITY', 'DCB', 'DPB', 'DUP', 'DTK', 'PROFKOM', 'KT_CLOUD_LAB');

-- AlterTable
ALTER TABLE "ip_addresses" ADD COLUMN "branch" "branch";
ALTER TABLE "ip_addresses" ADD COLUMN "responsible_party" TEXT;
ALTER TABLE "ip_addresses" ADD COLUMN "purpose" TEXT;
ALTER TABLE "ip_addresses" ADD COLUMN "device_type" "device_type";
ALTER TABLE "ip_addresses" ADD COLUMN "basis" TEXT;
