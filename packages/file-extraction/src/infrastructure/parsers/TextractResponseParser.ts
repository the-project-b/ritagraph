import { Block, BlockType, RelationshipType } from "@aws-sdk/client-textract";
import { Result, ok, err, ValidationError } from "@the-project-b/types";
import { createLogger, normalizeError } from "@the-project-b/logging";
import {
  Table,
  KeyValue,
  Layout,
  StructuredData,
} from "../../domain/entities/ExtractionResult.entity.js";

const logger = createLogger({ service: "file-extraction" }).child({
  module: "TextractResponseParser",
});

/**
 * Parses AWS Textract Block structures into domain format.
 * Handles text extraction, table parsing, form parsing, and layout detection.
 */
export class TextractResponseParser {
  /**
   * Parses Textract blocks into extracted text and structured data.
   */
  parse(
    blocks: Block[],
  ): Result<
    { text: string; structuredData?: StructuredData; confidence: number },
    ValidationError
  > {
    try {
      logger.info("Parsing Textract response", {
        blockCount: blocks.length,
      });

      const blockMap = this.buildBlockMap(blocks);
      const text = this.extractText(blocks, blockMap);
      const tables = this.extractTables(blocks, blockMap);
      const forms = this.extractForms(blocks, blockMap);
      const layout = this.extractLayout(blocks);
      const confidence = this.calculateAverageConfidence(blocks);

      const structuredData: StructuredData | undefined =
        tables.length > 0 || forms.length > 0 || layout.length > 0
          ? { tables, forms, layout }
          : undefined;

      logger.info("Parsed Textract response", {
        textLength: text.length,
        tableCount: tables.length,
        formCount: forms.length,
        layoutCount: layout.length,
        confidence: confidence.toFixed(2),
      });

      return ok({ text, structuredData, confidence });
    } catch (error) {
      const { error: normalizedError, message } = normalizeError(error);

      logger.error("Failed to parse Textract response", normalizedError, {
        errorMessage: message,
      });

      return err(
        new ValidationError("Failed to parse Textract response", {
          error: message,
        }),
      );
    }
  }

  /**
   * Builds a map of blocks by ID for efficient lookup.
   */
  private buildBlockMap(blocks: Block[]): Map<string, Block> {
    const map = new Map<string, Block>();

    for (const block of blocks) {
      if (block.Id) {
        map.set(block.Id, block);
      }
    }

    return map;
  }

  /**
   * Extracts plain text from blocks in reading order.
   */
  private extractText(blocks: Block[], _blockMap: Map<string, Block>): string {
    const lines: string[] = [];

    for (const block of blocks) {
      if (block.BlockType === BlockType.LINE && block.Text) {
        lines.push(block.Text);
      }
    }

    return lines.join("\n");
  }

  /**
   * Extracts tables from blocks.
   */
  private extractTables(
    blocks: Block[],
    blockMap: Map<string, Block>,
  ): Table[] {
    const tables: Table[] = [];

    for (const block of blocks) {
      if (block.BlockType === BlockType.TABLE) {
        const table = this.parseTable(block, blockMap);
        if (table) {
          tables.push(table);
        }
      }
    }

    return tables;
  }

  /**
   * Parses a single table block.
   */
  private parseTable(
    tableBlock: Block,
    blockMap: Map<string, Block>,
  ): Table | null {
    if (!tableBlock.Relationships) {
      return null;
    }

    const cellRelationship = tableBlock.Relationships.find(
      (rel) => rel.Type === RelationshipType.CHILD,
    );

    if (!cellRelationship || !cellRelationship.Ids) {
      return null;
    }

    const cells: Array<{ rowIndex: number; colIndex: number; text: string }> =
      [];
    let maxRow = 0;
    let maxCol = 0;

    for (const cellId of cellRelationship.Ids) {
      const cellBlock = blockMap.get(cellId);

      if (cellBlock && cellBlock.BlockType === BlockType.CELL) {
        const rowIndex = cellBlock.RowIndex || 0;
        const colIndex = cellBlock.ColumnIndex || 0;
        const text = this.getCellText(cellBlock, blockMap);

        cells.push({ rowIndex, colIndex, text });

        maxRow = Math.max(maxRow, rowIndex);
        maxCol = Math.max(maxCol, colIndex);
      }
    }

    const rows: string[][] = Array.from({ length: maxRow }, () =>
      Array.from({ length: maxCol }, () => ""),
    );

    for (const cell of cells) {
      rows[cell.rowIndex - 1][cell.colIndex - 1] = cell.text;
    }

    return {
      rows,
      confidence: tableBlock.Confidence || 0,
    };
  }

  /**
   * Gets text content from a table cell.
   */
  private getCellText(cellBlock: Block, blockMap: Map<string, Block>): string {
    if (!cellBlock.Relationships) {
      return "";
    }

    const childRelationship = cellBlock.Relationships.find(
      (rel) => rel.Type === RelationshipType.CHILD,
    );

    if (!childRelationship || !childRelationship.Ids) {
      return "";
    }

    const texts: string[] = [];

    for (const childId of childRelationship.Ids) {
      const childBlock = blockMap.get(childId);

      if (childBlock && childBlock.Text) {
        texts.push(childBlock.Text);
      }
    }

    return texts.join(" ");
  }

  /**
   * Extracts form key-value pairs from blocks.
   */
  private extractForms(
    blocks: Block[],
    blockMap: Map<string, Block>,
  ): KeyValue[] {
    const forms: KeyValue[] = [];

    for (const block of blocks) {
      if (
        block.BlockType === BlockType.KEY_VALUE_SET &&
        block.EntityTypes?.includes("KEY")
      ) {
        const keyValue = this.parseKeyValue(block, blocks, blockMap);
        if (keyValue) {
          forms.push(keyValue);
        }
      }
    }

    return forms;
  }

  /**
   * Parses a key-value pair from form blocks.
   */
  private parseKeyValue(
    keyBlock: Block,
    allBlocks: Block[],
    blockMap: Map<string, Block>,
  ): KeyValue | null {
    const key = this.getKeyValueText(keyBlock, blockMap);

    const valueRelationship = keyBlock.Relationships?.find(
      (rel) => rel.Type === RelationshipType.VALUE,
    );

    if (
      !valueRelationship ||
      !valueRelationship.Ids ||
      valueRelationship.Ids.length === 0
    ) {
      return null;
    }

    const valueBlockId = valueRelationship.Ids[0];
    const valueBlock = blockMap.get(valueBlockId);

    if (!valueBlock) {
      return null;
    }

    const value = this.getKeyValueText(valueBlock, blockMap);

    return {
      key,
      value,
      confidence: keyBlock.Confidence || 0,
    };
  }

  /**
   * Gets text from a key or value block.
   */
  private getKeyValueText(block: Block, blockMap: Map<string, Block>): string {
    if (!block.Relationships) {
      return "";
    }

    const childRelationship = block.Relationships.find(
      (rel) => rel.Type === RelationshipType.CHILD,
    );

    if (!childRelationship || !childRelationship.Ids) {
      return "";
    }

    const texts: string[] = [];

    for (const childId of childRelationship.Ids) {
      const childBlock = blockMap.get(childId);

      if (childBlock && childBlock.Text) {
        texts.push(childBlock.Text);
      }
    }

    return texts.join(" ").trim();
  }

  /**
   * Extracts layout information from blocks.
   */
  private extractLayout(blocks: Block[]): Layout[] {
    const layout: Layout[] = [];

    for (const block of blocks) {
      const layoutBlockTypes = [
        BlockType.LINE,
        BlockType.WORD,
        BlockType.TABLE,
        BlockType.KEY_VALUE_SET,
      ] as string[];

      if (
        block.BlockType &&
        block.Geometry?.BoundingBox &&
        layoutBlockTypes.includes(block.BlockType)
      ) {
        layout.push({
          blockType: block.BlockType,
          text: block.Text || "",
          geometry: {
            boundingBox: {
              width: block.Geometry.BoundingBox.Width || 0,
              height: block.Geometry.BoundingBox.Height || 0,
              left: block.Geometry.BoundingBox.Left || 0,
              top: block.Geometry.BoundingBox.Top || 0,
            },
          },
        });
      }
    }

    return layout;
  }

  /**
   * Calculates average confidence across all blocks.
   */
  private calculateAverageConfidence(blocks: Block[]): number {
    const confidenceValues = blocks
      .filter((block) => block.Confidence !== undefined)
      .map((block) => block.Confidence);

    if (confidenceValues.length === 0) {
      return 0;
    }

    const sum = confidenceValues.reduce((acc, val) => acc + val, 0);
    const average = sum / confidenceValues.length;

    return average / 100;
  }
}
