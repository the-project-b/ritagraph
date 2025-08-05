export type DataRepresentationLayerEntity = {
  id: string;
  type: "List" | "Object";
  entityType: "Employee" | "Contract" | "Payment";
  objectIds: Array<string>;

  preselectedFilters: Record<string, any>;
  omittedFields: Array<string>;
};

export function buildRepresentationString(
  entity: DataRepresentationLayerEntity
) {
  return `<${entity.type} id="${entity.id}" type=${entity.entityType} />`;
}
