/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';

export function UITarsHeader() {
  return (
    <SidebarMenu className="items-center">
      <SidebarMenuButton className="group-data-[collapsible=icon]:p-0! mb-2 hover:bg-transparent">
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold">UI-TARS</span>
          <span className="truncate text-xs pb-[1px]">Playground</span>
        </div>
      </SidebarMenuButton>
    </SidebarMenu>
  );
}
