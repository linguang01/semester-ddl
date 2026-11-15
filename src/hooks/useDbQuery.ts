import { useEffect, useRef, useState, type DependencyList } from 'react';
import { liveQuery } from 'dexie';

interface DbQueryState<T> {
  value: T;
  loading: boolean;
  error: Error | null;
}

/**
 * 把 Dexie 的 liveQuery 包一层 React 状态：
 * 自动订阅、自动重订阅（deps 变化时）、自动取消订阅。
 * 任何写操作导致查询结果变化时，组件都会拿到最新值。
 */
export function useDbQuery<T>(
  querier: () => Promise<T>,
  deps: DependencyList,
  initialValue: T,
): DbQueryState<T> {
  const [value, setValue] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initialValueRef = useRef(initialValue);

  // 依赖数组由调用方的 deps 决定（querier 每次渲染都是新函数，不能直接进依赖）。
  // oxlint-disable-next-line react/exhaustive-deps -- 依赖由调用方传入，规则无法静态推导
  useEffect(() => {
    // 切换查询键（例如跨天后的日期）时先清空旧值，避免把昨日选择当今日使用。
    setValue(initialValueRef.current);
    setError(null);
    setLoading(true);

    const subscription = liveQuery(querier).subscribe({
      next: (result) => {
        setValue(result);
        setError(null);
        setLoading(false);
      },
      error: (cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
        setLoading(false);
      },
    });

    return () => subscription.unsubscribe();
    // querier 每次渲染都是新函数，这里刻意只依赖调用方声明的 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { value, loading, error };
}
