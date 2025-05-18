import { SomeComponent } from "ref";

export const ExtendedSomeComponent = (
  props: Parameters<typeof SomeComponent>[0] & {
    enable: boolean;
  }
) => {
  // 中身はまじ適当
  return SomeComponent({
    ...props,
    style: {
      ...props.style,
      display: props.enable ? "block" : "none",
    },
  });
};
