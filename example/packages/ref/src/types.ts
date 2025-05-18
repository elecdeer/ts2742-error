type SomeComplexType = {
  a: number;
  nest?: SomeComplexType;
};

export type ReturnsSomeComplexType = () => SomeComplexType;
