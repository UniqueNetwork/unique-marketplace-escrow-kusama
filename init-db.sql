CREATE TABLE "KusamaProcessedBlock" (
    "BlockNumber" numeric(20,0) NOT NULL,
    "ProcessDate" timestamp without time zone NOT NULL
);
CREATE TABLE "QuoteIncomingTransaction" (
    "Id" uuid NOT NULL,
    "Amount" text NOT NULL,
    "QuoteId" numeric(20,0) NOT NULL,
    "Description" text NOT NULL,
    "AccountPublicKey" text NOT NULL,
    "BlockId" numeric(20,0),
    "Status" integer NOT NULL,
    "LockTime" timestamp without time zone,
    "ErrorMessage" text
);
CREATE TABLE "QuoteOutgoingTransaction" (
    "Id" uuid NOT NULL,
    "Status" integer NOT NULL,
    "ErrorMessage" text,
    "Value" text NOT NULL,
    "QuoteId" numeric(20,0) NOT NULL,
    "RecipientPublicKey" text NOT NULL,
    "WithdrawType" integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY "KusamaProcessedBlock"
    ADD CONSTRAINT "PK_KusamaProcessedBlock" PRIMARY KEY ("BlockNumber");
ALTER TABLE ONLY "QuoteIncomingTransaction"
    ADD CONSTRAINT "PK_QuoteIncomingTransaction" PRIMARY KEY ("Id");
ALTER TABLE ONLY "QuoteOutgoingTransaction"
    ADD CONSTRAINT "PK_QuoteOutgoingTransaction" PRIMARY KEY ("Id");


CREATE INDEX "IX_QuoteIncomingTransaction_AccountPublicKey" ON "QuoteIncomingTransaction" USING btree ("AccountPublicKey");
CREATE INDEX "IX_QuoteIncomingTransaction_Status_LockTime" ON "QuoteIncomingTransaction" USING btree ("Status", "LockTime") WHERE ("Status" = 0);
CREATE INDEX "IX_QuoteOutgoingTransaction_Status" ON "QuoteOutgoingTransaction" USING btree ("Status") WHERE ("Status" = 0);
