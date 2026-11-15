import { useCallback, useRef } from 'react';
import type { Notify } from '../components/Toast';
import { fullSync, getBoundSyncUserId, mergeLocalWorkspaceIntoAccount } from '../lib/sync';
import { describeError } from '../utils/error';

export interface UseAccountSwitchOptions {
  /** 当前登录账号 id；null 表示未登录 */
  userId: string | null;
  signOut: () => Promise<void>;
  notify: Notify;
}

export interface AccountSwitchState {
  /** 本机数据已绑定其他账号时，值为「新登录的账号 id」，需要用户显式选择 */
  conflictUserId: string | null;
  handleManualSync: () => Promise<void>;
  handleSignOut: () => Promise<void>;
  handleRejectSwitch: () => Promise<void>;
  handleMergeIntoAccount: () => Promise<void>;
}

/**
 * 账号与云同步相关的副作用。
 *
 * 核心约束：一个浏览器工作区只绑定一个云账号。换账号时必须先停下同步，
 * 让用户明确选择「把本机任务复制过去」还是「退出当前账号」——
 * 绝不允许把上一账号的任务偷偷上传给新账号。
 */
export function useAccountSwitch(options: UseAccountSwitchOptions): AccountSwitchState {
  const { userId, signOut, notify } = options;

  // 复制本机数据会清空并重建任务，必须防止重复点击造成二次复制。
  const mergingRef = useRef(false);

  /**
   * 归属冲突在渲染期直接派生，不用 effect + setState。
   *
   * 绑定关系存在 localStorage（不是 React 状态），只会在「登录 / 复制并切换 / 退出」时变化：
   * 复制成功后 `bindSyncOwner` 立刻改写它，下一次渲染冲突自然消失；
   * 退出后 userId 变 null，同样自然消失。用 effect 反而要额外维护一份可能不同步的副本。
   */
  const boundUserId = getBoundSyncUserId();
  const conflictUserId =
    userId !== null && boundUserId !== null && boundUserId !== userId ? userId : null;

  const handleManualSync = useCallback(async () => {
    if (userId === null) return;
    try {
      await fullSync(userId, true);
      notify('同步完成', 'success');
    } catch (cause) {
      notify(describeError(cause), 'error');
    }
  }, [notify, userId]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      notify('已退出登录，本机数据保留', 'info');
    } catch (cause) {
      notify(describeError(cause), 'error');
    }
  }, [notify, signOut]);

  const handleRejectSwitch = useCallback(async () => {
    try {
      await signOut();
      notify('已退出当前账号，本机数据未上传', 'info');
    } catch (cause) {
      notify(describeError(cause, '退出失败，请稍后重试'), 'error');
    }
  }, [notify, signOut]);

  const handleMergeIntoAccount = useCallback(async () => {
    if (conflictUserId === null || mergingRef.current) return;

    mergingRef.current = true;
    try {
      const count = await mergeLocalWorkspaceIntoAccount(conflictUserId);
      notify(`已将 ${count} 条本机任务复制到当前账号`, 'success');
    } catch (cause) {
      notify(describeError(cause, '复制失败，本机数据未受影响'), 'error');
      return;
    } finally {
      mergingRef.current = false;
    }

    // 走到这里说明复制已经成功、本机数据已归属新账号，此时冲突提示必须消失：
    // 若因为后面的同步失败而保留提示，用户再点一次「复制并切换」就会复制出第二份任务。
    try {
      await fullSync(conflictUserId, true);
    } catch {
      notify('复制完成，但云端同步失败，稍后会自动重试', 'info');
    }
  }, [conflictUserId, notify]);

  return {
    conflictUserId,
    handleManualSync,
    handleSignOut,
    handleRejectSwitch,
    handleMergeIntoAccount,
  };
}
