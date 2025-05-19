export type SomeComplexType = {
  num: number;
  nest?: SomeComplexType;
};

const val: SomeComplexType = {
  num: 1,
};

export const returnsInferredSomeComplexType = (): SomeComplexType => {
  return val;
};
