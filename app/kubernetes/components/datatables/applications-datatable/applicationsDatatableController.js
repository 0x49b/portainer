import _ from 'lodash-es';
import { KubernetesApplicationDeploymentTypes, KubernetesApplicationTypes } from 'Kubernetes/models/application/models';
import KubernetesApplicationHelper from 'Kubernetes/helpers/application';
import KubernetesNamespaceHelper from 'Kubernetes/helpers/namespaceHelper';
import { KubernetesConfigurationKinds } from 'Kubernetes/models/configuration/models';

angular.module('portainer.kubernetes').controller('KubernetesApplicationsDatatableController', [
  '$scope',
  '$controller',
  'DatatableService',
  'Authentication',
  function ($scope, $controller, DatatableService, Authentication) {
    angular.extend(this, $controller('GenericDatatableController', { $scope: $scope }));

    const ctrl = this;

    this.settings = Object.assign(this.settings, {
      showSystem: false,
    });

    this.state = Object.assign(this.state, {
      expandAll: false,
      expandedItems: [],
      namespace: '',
      namespaces: [],
    });

    this.filters = {
      state: {
        open: false,
        enabled: false,
        values: [],
      },
    };

    this.applicationTypeEnumToParamMap = {
      [KubernetesApplicationTypes.DEPLOYMENT]: 'Deployment',
      [KubernetesApplicationTypes.DAEMONSET]: 'DaemonSet',
      [KubernetesApplicationTypes.STATEFULSET]: 'StatefulSet',
      [KubernetesApplicationTypes.POD]: 'Pod',
    };

    this.expandAll = function () {
      this.state.expandAll = !this.state.expandAll;
      this.state.filteredDataSet.forEach((item) => this.expandItem(item, this.state.expandAll));
    };

    this.isItemExpanded = function (item) {
      return this.state.expandedItems.includes(item.Id);
    };

    this.isExpandable = function (item) {
      return item.KubernetesApplications || this.hasConfigurationSecrets(item) || !!this.getPublishedUrls(item).length;
    };

    this.expandItem = function (item, expanded) {
      // collapse item
      if (!expanded) {
        this.state.expandedItems = this.state.expandedItems.filter((id) => id !== item.Id);
        // expanded item
      } else if (expanded && !this.state.expandedItems.includes(item.Id)) {
        this.state.expandedItems = [...this.state.expandedItems, item.Id];
      }
      DatatableService.setDataTableExpandedItems(this.tableKey, this.state.expandedItems);
    };

    this.expandItems = function (storedExpandedItems) {
      this.state.expandedItems = storedExpandedItems;
      if (this.state.expandedItems.length === this.dataset.length) {
        this.state.expandAll = true;
      }
    };

    this.onDataRefresh = function () {
      const storedExpandedItems = DatatableService.getDataTableExpandedItems(this.tableKey);
      if (storedExpandedItems !== null) {
        this.expandItems(storedExpandedItems);
      }
    };

    this.onSettingsShowSystemChange = function () {
      this.updateNamespace();
      this.setSystemResources(this.settings.showSystem);
      DatatableService.setDataTableSettings(this.tableKey, this.settings);
    };

    this.isExternalApplication = function (item) {
      return KubernetesApplicationHelper.isExternalApplication(item);
    };

    this.isSystemNamespace = function (item) {
      // if all charts in a helm app/release are in the system namespace
      if (item.KubernetesApplications && item.KubernetesApplications.length > 0) {
        return item.KubernetesApplications.some((app) => KubernetesNamespaceHelper.isSystemNamespace(app.ResourcePool));
      }
      return KubernetesNamespaceHelper.isSystemNamespace(item.ResourcePool);
    };

    this.isDisplayed = function (item) {
      return !ctrl.isSystemNamespace(item) || ctrl.settings.showSystem;
    };

    this.getPublishedUrls = function (item) {
      // Map all ingress rules in published ports to their respective URLs
      const ingressUrls = item.PublishedPorts.flatMap((pp) => pp.IngressRules)
        .filter(({ Host, IP }) => Host || IP)
        .map(({ Host, IP, Path, TLS }) => {
          let scheme = TLS && TLS.filter((tls) => tls.hosts && tls.hosts.includes(Host)).length > 0 ? 'https' : 'http';
          return `${scheme}://${Host || IP}${Path}`;
        });

      // Map all load balancer service ports to ip address
      let loadBalancerURLs = [];
      if (item.LoadBalancerIPAddress) {
        loadBalancerURLs = item.PublishedPorts.map((pp) => `http://${item.LoadBalancerIPAddress}:${pp.Port}`);
      }

      // combine ingress urls
      const publishedUrls = [...ingressUrls, ...loadBalancerURLs];

      // Return the first URL - priority given to ingress urls, then services (load balancers)
      return publishedUrls.length > 0 ? publishedUrls : '';
    };

    this.hasConfigurationSecrets = function (item) {
      return item.Configurations && item.Configurations.some((config) => config.Data && config.Kind === KubernetesConfigurationKinds.SECRET);
    };

    /**
     * Do not allow applications in system namespaces to be selected
     */
    this.allowSelection = function (item) {
      return !this.isSystemNamespace(item);
    };

    this.applyFilters = function (item) {
      return ctrl.filters.state.values.some((filter) => item.ApplicationType === filter.type && filter.display);
    };

    this.onStateFilterChange = function () {
      this.filters.state.enabled = this.filters.state.values.some((filter) => !filter.display);
    };

    this.prepareTableFromDataset = function () {
      const availableTypeFilters = this.dataset.map((item) => ({ type: item.ApplicationType, display: true }));
      this.filters.state.values = _.uniqBy(availableTypeFilters, 'type');
    };

    this.onChangeNamespace = function () {
      this.onChangeNamespaceDropdown(this.state.namespace);
    };

    this.updateNamespace = function () {
      if (this.namespaces && this.settingsLoaded) {
        const allNamespacesOption = { Name: 'All namespaces', Value: '', IsSystem: false };
        const visibleNamespaceOptions = this.namespaces
          .filter((ns) => {
            if (!this.settings.showSystem && ns.IsSystem) {
              return false;
            }
            return true;
          })
          .map((ns) => ({ Name: ns.Name, Value: ns.Name, IsSystem: ns.IsSystem }));
        this.state.namespaces = [allNamespacesOption, ...visibleNamespaceOptions];

        if (this.state.namespace && !this.state.namespaces.find((ns) => ns.Name === this.state.namespace)) {
          if (this.state.namespaces.length > 1) {
            let defaultNS = this.state.namespaces.find((ns) => ns.Name === 'default');
            defaultNS = defaultNS || this.state.namespaces[1];
            this.state.namespace = defaultNS.Value;
          } else {
            this.state.namespace = this.state.namespaces[0].Value;
          }
        }
      }
    };

    this.$onChanges = function (changes) {
      // when the table is visible, sync the show system setting with the stack show system setting
      if (changes.isVisible && changes.isVisible.currentValue) {
        const storedStacksSettings = DatatableService.getDataTableSettings('kubernetes.applications.stacks');
        if (storedStacksSettings && storedStacksSettings.state) {
          this.settings.showSystem = storedStacksSettings.state.showSystemResources;
          DatatableService.setDataTableSettings(this.settingsKey, this.settings);
        }
      } else if (typeof this.isSystemResources !== 'undefined') {
        this.settings.showSystem = this.isSystemResources;
        DatatableService.setDataTableSettings(this.settingsKey, this.settings);
      }
      this.state.namespace = this.namespace;
      this.updateNamespace();
      this.prepareTableFromDataset();
    };

    this.$onInit = function () {
      this.isAdmin = Authentication.isAdmin();
      this.KubernetesApplicationDeploymentTypes = KubernetesApplicationDeploymentTypes;
      this.KubernetesApplicationTypes = KubernetesApplicationTypes;
      this.setDefaults();
      this.prepareTableFromDataset();

      this.state.orderBy = this.orderBy;
      const storedOrder = DatatableService.getDataTableOrder(this.tableKey);
      if (storedOrder !== null) {
        this.state.reverseOrder = storedOrder.reverse;
        this.state.orderBy = storedOrder.orderBy;
      }

      const textFilter = DatatableService.getDataTableTextFilters(this.tableKey);
      if (textFilter !== null) {
        this.state.textFilter = textFilter;
        this.onTextFilterChange();
      }

      const storedFilters = DatatableService.getDataTableFilters(this.tableKey);
      if (storedFilters !== null) {
        this.filters = storedFilters;
      }
      if (this.filters && this.filters.state) {
        this.filters.state.open = false;
      }

      const storedExpandedItems = DatatableService.getDataTableExpandedItems(this.tableKey);
      if (storedExpandedItems !== null) {
        this.expandItems(storedExpandedItems);
      }

      const storedSettings = DatatableService.getDataTableSettings(this.settingsKey);
      if (storedSettings !== null) {
        this.settings = storedSettings;
        this.settings.open = false;

        // make show system in sync with the stack show system settings
        const storedStacksSettings = DatatableService.getDataTableSettings('kubernetes.applications.stacks');
        if (storedStacksSettings && storedStacksSettings.state) {
          this.settings.showSystem = storedStacksSettings.state.showSystemResources;
        }

        this.setSystemResources && this.setSystemResources(this.settings.showSystem);
      }
      this.settingsLoaded = true;
      // Set the default selected namespace
      if (!this.state.namespace) {
        this.state.namespace = this.namespace;
      }

      this.updateNamespace();
      this.onSettingsRepeaterChange();
    };
  },
]);
